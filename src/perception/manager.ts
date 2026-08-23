/**
 * PP2 装配层：把内核（PerceptionSession）、策略层（strategies）、
 * 配置仓（configStore）与三个采集器连成完整感知管线。
 *
 * - 对外维持旧 facade 的同步语义（capturePageContext / buildPageInsight）；
 * - session 是「影子时态单元」：记录快照与时效（mutation/stale），
 *   供 PP4 消费端订阅；dom 变异 → 防抖重采集闭环在此接通。
 */

import type { RouteContextProvider } from '../providers/route-provider';
import { configStore } from './config-store';
import { DomCollector } from './collectors/dom-collector';
import { watchRoutes, type RouteWatchHandle } from './collectors/route-collector';
import { VisibilityController } from './collectors/visibility-collector';
import { PerceptionSession } from './kernel';
import {
  analyzeDomStats,
  buildInsight,
  type DomStats,
} from './strategies/insight';
import { applyAdaptiveStrategy } from './strategies/adaptive';
import {
  ELEMENT_ID_MAIN_CONTENT,
  getMainContentRoot,
  resolveScope,
} from './strategies/scope';
import { extractTablesFromScope } from './strategies/table';
import { extractVisibleText } from './strategies/text';
import type { CaptureResult, PageInsight, PageSnapshot, PerceptionState } from './types';

/** 无活跃会话时的观察态（usePerception 暴露给 UI） */
export type PerceptionStage = PerceptionState | 'none';

type PerceptionSubscriber = (snapshot: PageSnapshot | null, stage: PerceptionStage) => void;

class PagePerceptionManager {
  private session: PerceptionSession | null = null;
  private sessionRoute: string | null = null;
  /** 当前路由标题（insight 文案用，路由切换时更新） */
  private sessionTitle: string | undefined;
  private observeTargets: Element[] = [];

  /** PP4 订阅扇出：usePerception 等消费端监听快照/状态变化 */
  private readonly listeners = new Set<PerceptionSubscriber>();
  private sessionOffs: Array<() => void> = [];

  private readonly domCollector = new DomCollector(() => {
    this.session?.markMutation();
  });

  private readonly visibility = new VisibilityController((observing) => {
    if (observing) {
      this.resumeObserving();
    } else {
      this.domCollector.detach();
    }
  });

  private routeWatch: RouteWatchHandle | null = null;
  private routeProvider: RouteContextProvider | null = null;

  // ===== 策略编排（原 capturePageContext 主体，行为零改动） =====

  collectNow(routePath?: string, routeTitle?: string): CaptureResult {
    const root = document.getElementById(ELEMENT_ID_MAIN_CONTENT);
    if (!root) {
      console.warn('[page-context] root element #__vben_main_content not found');
      return { text: '', insight: null };
    }

    const config = routePath ? configStore.findConfig(routePath) : null;
    const strategy = config?.strategy ?? 'auto';

    let tableMd = '';
    let text = '';

    // 与旧实现的两个分支等价：命中 selectors 时逐目标提取后拼接，
    // 否则整块提取（单元素 join 无分隔符，两者输出一致）
    const scope = resolveScope(root, config);
    const scoped = !!(config && config.selectors.length > 0 && scope.length > 0);

    if (strategy !== 'text_only') {
      tableMd = extractTablesFromScope(scope);
    }
    if (strategy !== 'table_only') {
      text = scoped
        ? scope
            .map((el) => extractVisibleText(el))
            .filter(Boolean)
            .join('\n\n')
        : extractVisibleText(root);
    }

    let combined = '';
    if (tableMd) combined += `${tableMd}\n\n`;
    if (text) combined += text;
    combined = combined.trim();
    if (!combined) return { text: '', insight: null };

    if (strategy === 'full') {
      console.debug(
        `[page-context] route=${routePath} strategy=full tableMd=${tableMd.length}ch text=${text.length}ch -> ${combined.length}ch`,
      );
      return {
        text: combined,
        insight: this.computeInsight(root, config, routeTitle),
      };
    }

    const result = applyAdaptiveStrategy(combined);
    console.debug(
      `[page-context] route=${routePath} strategy=${strategy} tableMd=${tableMd.length}ch text=${text.length}ch combined=${combined.length}ch -> ${result.length}ch`,
    );
    return {
      text: result,
      insight: this.computeInsight(root, config, routeTitle),
    };
  }

  /**
   * 本地 DOM 统计洞察（degraded 模式仍可用）。
   * 无 title 时返回 null——保持 facade capturePageContext 的旧输出不变。
   */
  private computeInsight(
    root: HTMLElement,
    config: ReturnType<typeof configStore.findConfig>,
    routeTitle?: string,
  ): PageInsight | null {
    if (!routeTitle) return null;
    const scope = resolveScope(root, config);
    const stats = scope
      .map((el) => analyzeDomStats(el))
      .reduce(
        (acc: DomStats, s) => ({
          tableCount: acc.tableCount + s.tableCount,
          totalRows: acc.totalRows + s.totalRows,
          descriptionItems: acc.descriptionItems + s.descriptionItems,
          textLength: acc.textLength + s.textLength,
        }),
        { tableCount: 0, totalRows: 0, descriptionItems: 0, textLength: 0 },
      );
    return buildInsight(routeTitle, stats);
  }

  // ===== 洞察编排（原 buildPageInsight 主体，行为零改动） =====

  insightNow(routePath?: string, routeTitle?: string): PageInsight | null {
    const root = document.getElementById(ELEMENT_ID_MAIN_CONTENT);
    if (!root) return null;

    const config = routePath ? configStore.findConfig(routePath) : null;
    const scope = resolveScope(root, config);

    const stats = scope
      .map((el) => analyzeDomStats(el))
      .reduce(
        (acc: DomStats, s) => ({
          tableCount: acc.tableCount + s.tableCount,
          totalRows: acc.totalRows + s.totalRows,
          descriptionItems: acc.descriptionItems + s.descriptionItems,
          textLength: acc.textLength + s.textLength,
        }),
        { tableCount: 0, totalRows: 0, descriptionItems: 0, textLength: 0 },
      );

    const title = routeTitle || '当前页面';
    return buildInsight(title, stats);
  }

  // ===== facade 入口（保持 capturePageContext 同步签名） =====

  captureSync(routePath?: string): string {
    const session = this.ensureSession(routePath ?? '');
    if (session) {
      const snapshot = session.captureSync('manual');
      if (snapshot) return snapshot.text;
      // 异步退路且尚无 last-good：直接现算保底（等价旧行为）
    }
    return this.collectNow(routePath).text;
  }

  // ===== session 生命周期 =====

  private ensureSession(path: string): PerceptionSession | null {
    if (
      this.session &&
      this.sessionRoute === path &&
      this.session.state !== 'disposed'
    ) {
      return this.session;
    }
    void this.session?.dispose();
    this.session = null;
    this.sessionRoute = path;
    this.sessionTitle = this.currentRouteTitle();

    const root = getMainContentRoot();
    if (!root) return null;

    this.session = new PerceptionSession(path, {
      resolveEpoch: () => configStore.resolveEpoch(path),
      collect: () => this.collectNow(path, this.sessionTitle),
      onError: (error) => console.warn('[perception]', error),
    });
    this.bindSession();
    this.attachDomObserver(path, root);
    return this.session;
  }

  private currentRouteTitle(): string | undefined {
    const title = this.routeProvider?.getRoute().title;
    return typeof title === 'string' && title ? title : undefined;
  }

  /** PP4 订阅扇出：会话事件 → 全部订阅者（快照 + 状态） */
  private bindSession(): void {
    for (const off of this.sessionOffs) off();
    this.sessionOffs = [];
    const session = this.session;
    if (!session) return;
    const emit = () => {
      for (const listener of this.listeners) {
        listener(session.snapshot, session.state);
      }
    };
    this.sessionOffs = [
      session.on('perception/captured', emit),
      session.on('perception/state', emit),
    ];
  }

  private attachDomObserver(path: string, root: HTMLElement): void {
    const config = path ? configStore.findConfig(path) : null;
    const scope = resolveScope(root, config);
    // 可见性门控：不可见时只缓存目标，恢复时再接
    this.observeTargets = scope;
    if (this.visibility.observing) {
      this.domCollector.attach(scope);
    }
  }

  private resumeObserving(): void {
    if (this.observeTargets.length > 0) {
      this.domCollector.attach(this.observeTargets);
    }
    void this.session?.capture('manual');
  }

  // ===== 生命周期挂接（component.vue 调用） =====

  /** 组件挂载：路由监听 + 可见性监听 */
  start(route?: RouteContextProvider): void {
    this.routeProvider = route ?? null;
    this.visibility.start();
    if (route) {
      this.routeWatch = watchRoutes(route, (path) => {
        this.handleRouteChange(path);
      });
    }
  }

  /** 组件卸载：全部拆除（观察器/监听/会话） */
  async stop(): Promise<void> {
    this.routeWatch?.stop();
    this.routeWatch = null;
    this.routeProvider = null;
    this.visibility.stop();
    this.domCollector.detach();
    this.observeTargets = [];
    await this.session?.dispose();
    this.session = null;
    this.sessionRoute = null;
    this.sessionTitle = undefined;
    for (const off of this.sessionOffs) off();
    this.sessionOffs = [];
  }

  /** 抽屉开关联动（不可见暂停观察省 CPU） */
  setActive(active: boolean): void {
    this.visibility.setActive(active);
  }

  /** 后端健康联动（PP4 接 useBackendHealth；degraded 仅暂停采集，本地统计仍可用） */
  setDegraded(degraded: boolean): void {
    if (degraded) {
      this.session?.markDegraded();
    } else {
      this.session?.markRecovered();
    }
  }

  /** 路由切换：重建会话（对标 Fiber 随插件激活/销毁） */
  handleRouteChange(path: string): void {
    this.ensureSession(path);
  }

  /** 配置库更新级联（loadPerceptionConfigs 完成后调用，携带真实 diff 结果） */
  notifyConfigUpdate(changedIds: string[] = []): void {
    this.session?.notifyConfigUpdate(configStore.version, changedIds);
  }

  // ===== PP4 消费端 API（usePerception 调用） =====

  /** 订阅快照/状态变化；立即回调一次当前值，返回退订函数 */
  subscribe(listener: PerceptionSubscriber): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot(), this.getState());
    return () => this.listeners.delete(listener);
  }

  /** 当前 last-good 快照（实时反映 stale/mutationCount） */
  getSnapshot(): PageSnapshot | null {
    return this.session?.snapshot ?? null;
  }

  /** 当前感知状态（无会话为 'none'） */
  getState(): PerceptionStage {
    return this.session?.state ?? 'none';
  }

  /**
   * 发送前同步采集：stale 时 DOM 同步重读，产出最新快照。
   * 无会话/无主内容区时返回 null（调用方回退 capturePageContext）。
   */
  captureLatest(): PageSnapshot | null {
    const path =
      this.routeProvider?.getRoute().path ?? this.sessionRoute ?? '';
    const session = this.ensureSession(path);
    return session ? session.captureSync('manual') : null;
  }
}

/** 模块级单例：整个组件库共享一个感知管线 */
export const pagePerception = new PagePerceptionManager();
