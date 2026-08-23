/**
 * PP4 usePerception：感知管线的 Vue 消费端入口。
 *
 * - snapshot/insight/stage 均为响应式只读引用，由 manager 事件驱动更新；
 * - 订阅锚定当前 effectScope：组件卸载自动退订（session 生命周期归
 *   route-collector 管理，这里只退订、不销毁）；
 * - refresh()：手动触发一次采集（返回最新快照）。
 */

import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue';
import type { ComputedRef, ShallowRef } from 'vue';

import { pagePerception, type PerceptionStage } from '../perception/manager';
import type { PageInsight, PageSnapshot } from '../perception/types';

export interface UsePerception {
  /** last-good 快照（stale/mutationCount 实时反映时效） */
  snapshot: ShallowRef<PageSnapshot | null>;
  /** 本地 DOM 统计洞察（degraded 模式仍可用） */
  insight: ComputedRef<PageInsight | null>;
  /** 感知状态（含 'none'：尚无活跃会话） */
  stage: ShallowRef<PerceptionStage>;
  /** 手动刷新：同步重采集并返回最新快照 */
  refresh: () => PageSnapshot | null;
}

export function usePerception(): UsePerception {
  const snapshot = shallowRef<PageSnapshot | null>(null);
  const stage = shallowRef<PerceptionStage>('none');

  const stop = pagePerception.subscribe((next, nextStage) => {
    snapshot.value = next;
    stage.value = nextStage;
  });

  // 作用域销毁时退订；非组件上下文（无 scope）不自动退订，由调用方管理
  if (getCurrentScope()) {
    onScopeDispose(stop);
  }

  return {
    snapshot,
    insight: computed(() => snapshot.value?.insight ?? null),
    stage,
    refresh: () => pagePerception.captureLatest(),
  };
}
