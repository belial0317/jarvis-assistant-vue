import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EffectList } from './effect';
import { PerceptionSession } from './kernel';
import type {
  CaptureResult,
  PageSnapshot,
  PerceptionSessionDeps,
  SnapshotEpoch,
} from './types';

/** 构造可控的依赖注入：epoch 可变、collect 为 spy */
function createDeps(overrides: Partial<PerceptionSessionDeps> = {}) {
  let epoch: SnapshotEpoch = { configId: '', configVersion: 1 };
  const collect = vi.fn(
    (): CaptureResult | Promise<CaptureResult> => ({
      text: 'page-content',
      insight: null,
    }),
  );
  const deps: PerceptionSessionDeps = {
    resolveEpoch: () => epoch,
    collect,
    ...overrides,
  };
  return {
    deps,
    collect,
    setEpoch(next: Partial<SnapshotEpoch>) {
      epoch = { ...epoch, ...next };
    },
  };
}

describe('EffectList', () => {
  it('逆序回收：后登记的先执行', async () => {
    const order: number[] = [];
    const list = new EffectList();
    list.push(() => void order.push(1));
    list.push(() => void order.push(2));
    list.push(async () => void order.push(3));
    await list.clear();
    expect(order).toEqual([3, 2, 1]);
    expect(list.size).toBe(0);
  });

  it('单个失败不阻塞其余回收（吞错上报 onError）', async () => {
    const order: number[] = [];
    const errors: unknown[] = [];
    const list = new EffectList((error) => void errors.push(error));
    list.push(() => void order.push(1));
    list.push(() => {
      throw new Error('boom');
    });
    list.push(async () => void order.push(2));
    await list.clear();
    expect(order).toEqual([2, 1]);
    expect(errors).toHaveLength(1);
  });
});

describe('PerceptionSession 状态机', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('idle → observing → ready，产出快照并广播 captured/state', async () => {
    const { deps, collect } = createDeps();
    const session = new PerceptionSession('/system/user', deps);
    const states: string[] = [];
    const captured: PageSnapshot[] = [];
    session.on('perception/state', (e) => {
      if (e.type === 'perception/state') states.push(`${e.from}->${e.to}`);
    });
    session.on('perception/captured', (e) => {
      if (e.type === 'perception/captured') captured.push(e.snapshot);
    });

    expect(session.state).toBe('idle');
    const snapshot = await session.start();

    expect(collect).toHaveBeenCalledTimes(1);
    expect(session.state).toBe('ready');
    expect(states).toEqual(['idle->observing', 'observing->ready']);
    expect(snapshot?.text).toBe('page-content');
    expect(snapshot?.epoch).toEqual({ configId: '', configVersion: 1 });
    expect(snapshot?.stale).toBe(false);
    expect(captured).toHaveLength(1);
    await session.dispose();
  });

  it('ready → stale（变异）→ 防抖后重采集 → ready', async () => {
    const { deps, collect } = createDeps({ debounceMs: 500 });
    const session = new PerceptionSession('/a', deps);
    await session.start();
    collect.mockClear();

    session.markMutation();
    session.markMutation();
    expect(session.state).toBe('stale');
    expect(session.mutationCount).toBe(2);
    expect(session.snapshot?.stale).toBe(true);
    // 防抖窗口内不采集
    expect(collect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(session.state).toBe('ready');
    expect(session.mutationCount).toBe(0);
    expect(session.snapshot?.stale).toBe(false);
    await session.dispose();
  });

  it('采集失败保留 last-good 并置 stale（hasLastGood 事件）', async () => {
    const { deps, collect } = createDeps();
    const session = new PerceptionSession('/a', deps);
    await session.start();

    collect.mockImplementation(() => {
      throw new Error('dom gone');
    });
    const failedEvents: unknown[] = [];
    session.on('perception/failed', (e) => {
      if (e.type === 'perception/failed') failedEvents.push(e);
    });
    const snapshot = await session.capture('manual');

    expect(session.state).toBe('failed');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]).toMatchObject({ hasLastGood: true });
    // last-good 保留且标记过期
    expect(snapshot?.text).toBe('page-content');
    expect(snapshot?.stale).toBe(true);
    await session.dispose();
  });

  it('degraded 往返：断连暂停采集，恢复后立即重采', async () => {
    const { deps, collect } = createDeps();
    const session = new PerceptionSession('/a', deps);
    await session.start();
    collect.mockClear();

    session.markDegraded();
    expect(session.state).toBe('degraded');

    // degraded 下变异不触发调度，显式 capture 直接返回旧快照
    session.markMutation();
    await session.capture('manual');
    expect(collect).not.toHaveBeenCalled();
    expect(session.snapshot?.text).toBe('page-content');

    session.markRecovered();
    expect(session.state).toBe('observing');
    await vi.waitFor(() => expect(session.state).toBe('ready'));
    expect(collect).toHaveBeenCalledTimes(1);
    await session.dispose();
  });

  it('dispose 为终态：变异到达不悬挂、后续 start/capture 均为 no-op', async () => {
    const { deps, collect } = createDeps();
    const session = new PerceptionSession('/a', deps);
    await session.start();
    collect.mockClear();

    await session.dispose();
    expect(session.state).toBe('disposed');

    session.markMutation();
    expect(session.mutationCount).toBe(0);
    await session.start();
    await session.capture('manual');
    expect(collect).not.toHaveBeenCalled();
    // 重复 dispose 幂等
    await session.dispose();
  });

  it('在途采集期间销毁：结果被丢弃，不产生状态跃迁与快照', async () => {
    const { deps, collect } = createDeps();
    let release!: (value: CaptureResult) => void;
    collect.mockImplementation(
      () =>
        new Promise<CaptureResult>((resolve) => {
          release = resolve;
        }),
    );
    const session = new PerceptionSession('/a', deps);
    const pending = session.start();
    // dispose 会等待在途采集，须先发起销毁、再放行采集，最后统一 await
    const disposeDone = session.dispose();
    release({ text: 'late', insight: null });
    await Promise.all([pending, disposeDone]);

    expect(await pending).toBeNull();
    expect(session.snapshot).toBeNull();
  });
});

describe('PerceptionSession epoch 与竞态', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('captureSync：同步 collect 立即提交快照（无微任务等待）', () => {
    const { deps, collect } = createDeps();
    const session = new PerceptionSession('/a', deps);
    const snapshot = session.captureSync('manual');
    // 同步断言：不 await 也能拿到结果，状态已 ready
    expect(snapshot?.text).toBe('page-content');
    expect(session.state).toBe('ready');
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('captureSync：同步 collect 抛错走 failed 且保留 last-good', async () => {
    const { deps, collect } = createDeps();
    const session = new PerceptionSession('/a', deps);
    session.captureSync('manual');

    collect.mockImplementation(() => {
      throw new Error('sync boom');
    });
    const snapshot = session.captureSync('manual');
    expect(session.state).toBe('failed');
    expect(snapshot?.text).toBe('page-content');
    expect(snapshot?.stale).toBe(true);
  });

  it('captureSync：异步 collect 自动退回异步路径，同步侧返回当前快照', async () => {
    const { deps, collect } = createDeps();
    let calls = 0;
    collect.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        // 首次同步
        return { text: 'first', insight: null };
      }
      return Promise.resolve({ text: 'async-second', insight: null });
    });
    const session = new PerceptionSession('/a', deps);
    expect(session.captureSync('manual')?.text).toBe('first');

    const syncView = session.captureSync('manual');
    // 异步退路：同步侧拿到旧快照，异步在微任务后提交
    expect(syncView?.text).toBe('first');
    await vi.waitFor(() => expect(session.snapshot?.text).toBe('async-second'));
    expect(session.state).toBe('ready');
  });

  it('captureSync 后 markMutation：快照实时反映 stale 与变异数', async () => {
    const { deps } = createDeps({ debounceMs: 10_000 });
    const session = new PerceptionSession('/a', deps);
    session.captureSync('manual');
    session.markMutation();
    expect(session.snapshot?.mutationCount).toBe(1);
    expect(session.snapshot?.stale).toBe(true);
    expect(session.snapshot?.text).toBe('page-content');
  });

  it('采集期间 epoch 变化：旧结果丢弃并按新 epoch 重采', async () => {
    const { deps, collect, setEpoch } = createDeps();
    let releaseFirst!: (value: CaptureResult) => void;
    let calls = 0;
    collect.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise<CaptureResult>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return { text: 'second', insight: null };
    });

    const session = new PerceptionSession('/a', deps);
    const pending = session.start();
    // 首次采集挂起期间配置版本升级
    setEpoch({ configVersion: 2 });
    releaseFirst({ text: 'first', insight: null });

    const snapshot = await pending;
    expect(calls).toBe(2);
    expect(snapshot?.text).toBe('second');
    expect(snapshot?.epoch.configVersion).toBe(2);
    await session.dispose();
  });

  it('并发 capture 复用同一 pending promise（collect 只调一次）', async () => {
    const { deps, collect } = createDeps();
    let release!: (value: CaptureResult) => void;
    collect.mockImplementation(
      () =>
        new Promise<CaptureResult>((resolve) => {
          release = resolve;
        }),
    );
    const session = new PerceptionSession('/a', deps);
    const p1 = session.start();
    const p2 = session.capture('manual');
    expect(p1).toBe(p2);

    release({ text: 'once', insight: null });
    const [s1, s2] = await Promise.all([p1, p2]);
    expect(collect).toHaveBeenCalledTimes(1);
    expect(s1?.text).toBe('once');
    expect(s2?.text).toBe('once');
    await session.dispose();
  });

  it('通知配置更新：epoch 变化触发重采集，无变化则 no-op', async () => {
    const { deps, collect, setEpoch } = createDeps();
    const session = new PerceptionSession('/a', deps);
    await session.start();
    collect.mockClear();

    // 版本未变：不重采
    session.notifyConfigUpdate(1, []);
    expect(collect).not.toHaveBeenCalled();

    // 版本升级：重采
    setEpoch({ configVersion: 2 });
    session.notifyConfigUpdate(2, ['cfg-1']);
    await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(1));
    expect(session.snapshot?.epoch.configVersion).toBe(2);
    await session.dispose();
  });
});

describe('PerceptionSession 订阅与事件', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('事件按会话实例分发不串台，订阅随 dispose 回收', async () => {
    const a = createDeps();
    const b = createDeps();
    const sessionA = new PerceptionSession('/a', a.deps);
    const sessionB = new PerceptionSession('/b', b.deps);
    const gotA: number[] = [];
    const gotB: number[] = [];
    sessionA.on('perception/captured', () => void gotA.push(1));
    sessionB.on('perception/captured', () => void gotB.push(1));

    await sessionA.start();
    expect(gotA).toHaveLength(1);
    expect(gotB).toHaveLength(0);

    await sessionA.dispose();
    await sessionA.start(); // 终态 no-op，不再派发
    expect(gotA).toHaveLength(1);
    await sessionB.dispose();
  });

  it('监听器抛错不阻断其他监听器', async () => {
    const { deps } = createDeps();
    const session = new PerceptionSession('/a', deps);
    const ok: number[] = [];
    session.on('perception/captured', () => {
      throw new Error('listener boom');
    });
    session.on('perception/captured', () => void ok.push(1));
    await session.start();
    expect(ok).toHaveLength(1);
    await session.dispose();
  });

  it('dispose 等待在途采集结束后再回收 Effect', async () => {
    const { deps, collect } = createDeps();
    let release!: (value: CaptureResult) => void;
    collect.mockImplementation(
      () =>
        new Promise<CaptureResult>((resolve) => {
          release = resolve;
        }),
    );
    const disposedEffects: string[] = [];
    const session = new PerceptionSession('/a', deps);
    session.on('perception/captured', () => void disposedEffects.push('never'));
    const effectDone = session as unknown as { effects: EffectList };
    effectDone.effects.push(() => void disposedEffects.push('observer'));

    const pending = session.start();
    const disposeDone = session.dispose();
    release({ text: 'late', insight: null });
    await Promise.all([pending, disposeDone]);

    expect(disposedEffects).toEqual(['observer']);
  });
});
