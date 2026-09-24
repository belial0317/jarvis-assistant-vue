/**
 * 智能体路径诊断：数据加载组合式函数（T3）。
 * overview 按需加载 + span 分页；detail 按 spanId 缓存；
 * 后台完成事件由调用方触发 refresh() 使缓存失效。
 */
import { ref, shallowRef } from 'vue';
import { getMessageTrace, getTraceSpanDetail, type TraceOverview, type TraceSpanDetail } from '../api/trace';

export function useAgentTrace() {
  const overview = shallowRef<TraceOverview | null>(null);
  const detailCache = shallowRef<Map<string, TraceSpanDetail>>(new Map());
  const loading = ref(false);
  const loadingDetail = ref(false);
  const error = ref<string | null>(null);

  async function load(messageId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      overview.value = await getMessageTrace(messageId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      overview.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (!overview.value || !overview.value.hasMore || !overview.value.cursor) return;
    loading.value = true;
    try {
      const next = await getMessageTrace(overview.value.messageId, Number(overview.value.cursor));
      overview.value = {
        ...next,
        spans: [...overview.value.spans, ...next.spans],
        cursor: next.cursor,
        hasMore: next.hasMore,
      };
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function loadDetail(traceId: string, spanId: string): Promise<TraceSpanDetail | null> {
    const cached = detailCache.value.get(spanId);
    if (cached) return cached;
    loadingDetail.value = true;
    try {
      const d = await getTraceSpanDetail(traceId, spanId);
      detailCache.value.set(spanId, d);
      return d;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  /** 后台子任务完成/刷新：清空 detail 缓存并重载 overview */
  async function refresh(messageId: string): Promise<void> {
    detailCache.value = new Map();
    await load(messageId);
  }

  return { overview, detailCache, loading, loadingDetail, error, load, loadMore, loadDetail, refresh };
}
