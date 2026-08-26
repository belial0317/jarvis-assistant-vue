import { EffectList } from './effect';
import { PerceptionEventBus } from './events';
import type {
  CaptureReason,
  CaptureResult,
  PageSnapshot,
  PerceptionEventName,
  PerceptionListener,
  PerceptionSessionDeps,
  PerceptionState,
  SnapshotEpoch,
} from './types';

const DEFAULT_DEBOUNCE_MS = 500;

function epochKey(epoch: SnapshotEpoch): string {
  return `${epoch.configId}@${epoch.configVersion}`;
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof (value as PromiseLike<T>).then === 'function';
}

/**
 * 感知会话：一次「路由进入 → 离开」的页面感知时态单元（对标 cordis Fiber）。
 *
 * - epoch（configId@configVersion）变化自动触发重采集；
 * - 变异经防抖重采集，提交前复查 epoch 与 token，过期结果丢弃
 *   （对标 _reload await 后复查 epoch）；
 * - Effect/订阅统一逆序回收（对标 _unload）；
 * - 并发 capture 复用同一 pending promise（对标 inertia 防重入）；
 * - 内核不接触 DOM 与网络，采集逻辑由 deps.collect 注入。
 */
export class PerceptionSession {
  readonly routePath: string;

  private _state: PerceptionState = 'idle';
  private _snapshot: PageSnapshot | null = null;
  private _mutationCount = 0;
  private _epochAtCapture: string | null = null;
  private _pendingCapture: Promise<PageSnapshot | null> | null = null;
  private _captureToken = 0;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly effects: EffectList;
  private readonly bus = new PerceptionEventBus();
  private readonly deps: PerceptionSessionDeps & { debounceMs: number };

  constructor(routePath: string, deps: PerceptionSessionDeps) {
    this.routePath = routePath;
    this.deps = { debounceMs: DEFAULT_DEBOUNCE_MS, ...deps };
    this.effects = new EffectList(deps.onError);
  }

  get state(): PerceptionState {
    return this._state;
  }

  /** last-good 快照视图：stale/mutationCount 实时反映当前时效 */
  get snapshot(): PageSnapshot | null {
    if (!this._snapshot) return null;
    return {
      ...this._snapshot,
      mutationCount: this._mutationCount,
      stale: this._state === 'stale' || this._state === 'failed',
    };
  }

  get mutationCount(): number {
    return this._mutationCount;
  }

  /** 启动会话并立即以 route 原因采集 */
  start(): Promise<PageSnapshot | null> {
    if (this._state === 'disposed') return Promise.resolve(null);
    if (this._state === 'idle') this._setState('observing');
    return this.capture('route');
  }

  /**
   * 显式采集；并发调用复用同一 pending promise（对标 inertia 防重入）。
   * degraded 下跳过并返回当前快照（远程依赖不可用，本地沿用）。
   */
  capture(reason: CaptureReason): Promise<PageSnapshot | null> {
    if (this._state === 'disposed' || this._state === 'degraded') {
      return Promise.resolve(this.snapshot);
    }
    if (this._pendingCapture) return this._pendingCapture;
    this._pendingCapture = this._runCapture(reason).finally(() => {
      this._pendingCapture = null;
    });
    return this._pendingCapture;
  }

  /**
   * 同步采集：为保持 facade 同步签名（capturePageContext）提供。
   * 仅当 deps.collect 同步返回时同步提交；异步 collect 自动退回异步路径，
   * 同步调用者拿到当前 last-good 快照。
   */
  captureSync(reason: CaptureReason): PageSnapshot | null {
    if (this._state === 'disposed' || this._state === 'degraded') {
      return this.snapshot;
    }
    const token = ++this._captureToken;
    const startEpoch = this.deps.resolveEpoch();
    if (this._state !== 'observing') this._setState('observing');
    let raw: CaptureResult | Promise<CaptureResult>;
    try {
      raw = this.deps.collect();
    } catch (error) {
      return this._failCapture(token, error);
    }
    if (isPromiseLike<CaptureResult>(raw)) {
      // 异步 collect：转入异步路径统一编排
      void this.capture(reason);
      return this.snapshot;
    }
    // 同步执行期间 resolveEpoch 结果不会漂移（单线程），直接提交
    return this._commitCapture(token, startEpoch, raw);
  }

  /** DOM 变异通知（dom-collector 调用）：置 stale 并防抖重采集 */
  markMutation(): void {
    // 防悬挂（对标异步迭代器产出前查 epoch）：已销毁会话忽略变异。
    // idle 态（会话已建未首采，P1-2 修复期）仅累计计数不置 stale——
    // 首采 capture 会全量读 DOM，此前变异只影响时效信号而非内容正确性
    if (this._state === 'disposed') return;
    this._mutationCount++;
    if (this._state === 'idle') return;
    if (
      this._state === 'ready' ||
      this._state === 'stale' ||
      this._state === 'failed' ||
      this._state === 'observing'
    ) {
      this._setState('stale');
      this.bus.emit({
        type: 'perception/stale',
        reason: 'mutation',
        mutationCount: this._mutationCount,
      });
    }
    this._scheduleDebouncedCapture();
  }

  /** 后端断连门控（对标 Service.check）：暂停采集，快照沿用 */
  markDegraded(): void {
    if (this._state === 'disposed' || this._state === 'degraded') return;
    this._cancelDebounce();
    this._setState('degraded');
  }

  /** 后端恢复：重新观察并立即采集 */
  markRecovered(): void {
    if (this._state !== 'degraded') return;
    this._setState('observing');
    void this.capture('manual');
  }

  /**
   * 配置版本更新级联（config-store 调用，PP3 接入）：
   * 重解析 epoch，与上次提交的 epoch 不一致时重采集，一致则 no-op
   * （对标 RegistryService.notify 的依赖重算）。
   */
  notifyConfigUpdate(version: number, changedIds: string[]): void {
    if (this._state === 'disposed') return;
    this.bus.emit({ type: 'perception/config-updated', version, changedIds });
    let key: string;
    try {
      key = epochKey(this.deps.resolveEpoch());
    } catch {
      return; // 配置源不可用，沿用 last-good
    }
    if (this._epochAtCapture !== null && key === this._epochAtCapture) return;
    if (this._snapshot) this._setState('stale');
    void this.capture('config');
  }

  /** 订阅事件；返回取消函数，订阅随会话销毁一并回收 */
  on(name: PerceptionEventName, listener: PerceptionListener): () => void {
    const off = this.bus.on(name, listener);
    const unregister = this.effects.push(off);
    return () => {
      unregister();
      off();
    };
  }

  /** 销毁会话：终态，等待在途采集结束后逆序回收全部 Effect */
  async dispose(): Promise<void> {
    if (this._state === 'disposed') return;
    this._cancelDebounce();
    this._setState('disposed');
    // 对标 await inertia：等在途采集落地（其结果会因 disposed 被丢弃）
    while (this._pendingCapture) {
      await this._pendingCapture.catch(() => {});
    }
    await this.effects.clear();
    this.bus.clear();
  }

  private async _runCapture(reason: CaptureReason): Promise<PageSnapshot | null> {
    const token = ++this._captureToken;
    const startEpoch = this.deps.resolveEpoch();
    const startKey = epochKey(startEpoch);
    if (this._state !== 'observing') this._setState('observing');
    try {
      const result = await this.deps.collect();
      // 提交前复查：会话已销毁或已有更新的采集排队 → 丢弃本次结果
      if (this._state === 'disposed' || this._captureToken !== token) return null;
      // epoch 复查：采集期间配置已变 → 丢弃并按新 epoch 重采一轮
      const endKey = epochKey(this.deps.resolveEpoch());
      if (endKey !== startKey) return this._runCapture(reason);
      return this._commitCapture(token, startEpoch, result);
    } catch (error) {
      return this._failCapture(token, error);
    }
  }

  /** 提交快照（capture / captureSync 公共路径） */
  private _commitCapture(
    token: number,
    startEpoch: SnapshotEpoch,
    result: CaptureResult,
  ): PageSnapshot | null {
    if (this._state === 'disposed' || this._captureToken !== token) return null;
    this._mutationCount = 0;
    this._epochAtCapture = epochKey(startEpoch);
    this._snapshot = {
      epoch: startEpoch,
      routePath: this.routePath,
      capturedAt: Date.now(),
      mutationCount: 0,
      stale: false,
      text: result.text,
      insight: result.insight,
    };
    this._setState('ready');
    this.bus.emit({ type: 'perception/captured', snapshot: this.snapshot! });
    return this.snapshot;
  }

  /** 采集失败：保留 last-good 并标记过期（对标 HMR last-good 回滚） */
  private _failCapture(token: number, error: unknown): PageSnapshot | null {
    if (this._state === 'disposed' || this._captureToken !== token) return null;
    this._setState('failed');
    this.bus.emit({
      type: 'perception/failed',
      error,
      hasLastGood: !!this._snapshot,
    });
    return this.snapshot;
  }

  private _scheduleDebouncedCapture(): void {
    if (this._state === 'disposed' || this._state === 'degraded') return;
    this._cancelDebounce();
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this.capture('mutation');
    }, this.deps.debounceMs);
  }

  private _cancelDebounce(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  private _setState(next: PerceptionState): void {
    const from = this._state;
    if (from === next) return;
    this._state = next;
    this.bus.emit({ type: 'perception/state', from, to: next });
  }
}
