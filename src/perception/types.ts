/**
 * PP1 感知内核公共类型（对标 cordis Fiber/Events 的页面感知转译，零 Vue 依赖）。
 * 设计文档：docs/memory/tasks-2608-0819-01/PP1-perception-kernel.md
 */

/** 感知会话状态机（对标 FiberState 七态） */
export type PerceptionState =
  | 'idle'
  | 'observing'
  | 'ready'
  | 'stale'
  | 'degraded'
  | 'failed'
  | 'disposed';

/** 页面洞察（与 utils/page-context.ts 的 PageInsight 结构兼容） */
export interface PageInsight {
  description: string;
  hints: string[];
}

/** 内容指纹（对标 Fiber epoch）：命中配置 + 配置库版本 */
export interface SnapshotEpoch {
  /** 命中的感知配置 id；未命中任何配置时为 '' */
  configId: string;
  /** 配置库版本（manifest version） */
  configVersion: number;
}

/** 一次采集产出的页面快照 */
export interface PageSnapshot {
  epoch: SnapshotEpoch;
  routePath: string;
  /** 采集完成时间（Date.now()） */
  capturedAt: number;
  /** 采集后累计的 DOM 变异数（时效性信号） */
  mutationCount: number;
  /** 是否已过期（变异未重采 / 采集失败沿用旧值） */
  stale: boolean;
  /** 三级降级后的页面上下文文本 */
  text: string;
  /** 本地 DOM 统计洞察（degraded 模式下仍可用） */
  insight: PageInsight | null;
}

export type CaptureReason = 'route' | 'mutation' | 'manual' | 'config';

/** 采集结果（策略层注入内核的产物） */
export interface CaptureResult {
  text: string;
  insight: PageInsight | null;
}

/** perception/* 事件族（对标 cordis internal/* 事件） */
export type PerceptionEvent =
  | { type: 'perception/captured'; snapshot: PageSnapshot }
  | { type: 'perception/stale'; reason: CaptureReason; mutationCount: number }
  | { type: 'perception/failed'; error: unknown; hasLastGood: boolean }
  | { type: 'perception/config-updated'; version: number; changedIds: string[] }
  | { type: 'perception/state'; from: PerceptionState; to: PerceptionState };

export type PerceptionEventName = PerceptionEvent['type'];
export type PerceptionListener = (event: PerceptionEvent) => void;

/**
 * 内核依赖注入：epoch 解析与采集执行均由外层提供，内核不接触 DOM 与网络
 * （对标 cordis 把副作用收敛到 Fiber effect、内核只管编排的做法）。
 */
export interface PerceptionSessionDeps {
  /** 解析当前 epoch（配置匹配 + 版本），由配置层（config-store）提供 */
  resolveEpoch: () => SnapshotEpoch;
  /** 执行采集（策略层注入）：DOM 提取 + 三级降级，返回文本与本地洞察 */
  collect: () => CaptureResult | Promise<CaptureResult>;
  /** 变异防抖窗口（ms），默认 500 */
  debounceMs?: number;
  /** 错误回调（Effect 回收吞错上报），默认静默 */
  onError?: (error: unknown, label: string) => void;
}
