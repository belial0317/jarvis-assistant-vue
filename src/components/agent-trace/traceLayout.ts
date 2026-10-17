/**
 * 智能体路径诊断器 T0 原型：布局与判定纯函数。
 * 契约来源：docs/memory/tasks-2609-2316-45/交互与数据契约.md
 * 只读诊断：布局仅由后端 span/edge 事实驱动，前端不推断执行状态。
 */

export interface TraceSpanLike {
  spanId: string;
  parentSpanId?: string | null;
  sequenceNo: number;
  kind: string;
  label?: string;
  fromParticipantId?: string;
  toParticipantId?: string;
  executionStatus: string;
  resultKind?: string | null;
  durationMs?: number | null;
  childTraceId?: string | null;
  callKey?: string | null;
}

export interface TraceEdgeLike {
  id: string;
  fromSpanId: string;
  toSpanId: string;
  direction: 'request' | 'return';
  resultSpanId?: string | null;
}

export interface TraceParticipant {
  id: string;
  type: string;
  label: string;
}

export interface TraceDetailLike {
  input?: { format: string; data: unknown; visibility?: Record<string, boolean> } | null;
  output?: { format: string; data: unknown; visibility?: Record<string, boolean> } | null;
  error?: { code: string; message: string } | null;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: string;
  executionStatus: string;
  resultKind: string | null;
  /** 同名并行调用分组：同 callKey 的节点共享组标记 */
  callKey: string | null;
  childTraceId: string | null;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  /** request=执行请求；return=观测到的返回（仅事实返回才生成） */
  direction: 'request' | 'return';
  label: string;
  executionStatus: string;
}

export const COL_WIDTH = 240;
export const ROW_HEIGHT = 96;

/**
 * 参与者按首次出现排序（请求发起方在前），用于时序泳道列位置。
 */
export function orderParticipants(spans: TraceSpanLike[], declared: TraceParticipant[]): TraceParticipant[] {
  const seen: TraceParticipant[] = [];
  const indexOf = new Map<string, number>();
  const push = (id: string, type: string, label: string) => {
    if (id && !indexOf.has(id)) {
      indexOf.set(id, seen.length);
      seen.push({ id, type, label });
    }
  };
  for (const p of declared) push(p.id, p.type, p.label);
  for (const s of [...spans].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    push(s.fromParticipantId ?? 'unknown', 'actor', s.fromParticipantId ?? 'unknown');
    push(s.toParticipantId ?? 'unknown', 'actor', s.toParticipantId ?? 'unknown');
  }
  return seen;
}

/**
 * 仅观测到实际返回的 span 才生成 return 边（契约 D07）：
 * denied/cancelled/timeout/not_observed/background 一律不画返回箭头。
 */
export function hasObservedReturn(span: TraceSpanLike, edges: TraceEdgeLike[]): boolean {
  const fromEdge = edges.some((e) => e.direction === 'return' && e.resultSpanId === span.spanId);
  if (fromEdge) return true;
  return span.executionStatus === 'success' || span.executionStatus === 'error';
}

/**
 * 同名并行调用分组：同 callKey 的 span 归入同一组，用于并行不串线断言。
 */
export function groupByCallKey(spans: TraceSpanLike[]): Map<string, TraceSpanLike[]> {
  const groups = new Map<string, TraceSpanLike[]>();
  for (const s of spans) {
    if (!s.callKey) continue;
    const list = groups.get(s.callKey) ?? [];
    list.push(s);
    groups.set(s.callKey, list);
  }
  return groups;
}

/**
 * 时序布局：参与者列 × sequenceNo 行。节点落在被调用方泳道。
 * 边连接 spanId（契约 edges.fromSpanId/toSpanId）：
 * - request：source=父 span（无父则不画，根 span 即入口）
 * - return：仅 hasObservedReturn 成立时画，source=spanId，target=父 span
 */
export function layoutTrace(
  spans: TraceSpanLike[],
  edges: TraceEdgeLike[],
  participants: TraceParticipant[],
): { nodes: LayoutNode[]; layoutEdges: LayoutEdge[]; participants: TraceParticipant[] } {
  const ordered = orderParticipants(spans, participants);
  const colOf = new Map(ordered.map((p, i) => [p.id, i]));
  const sorted = [...spans].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const nodes: LayoutNode[] = sorted.map((s, i) => ({
    id: s.spanId,
    x: (colOf.get(s.toParticipantId ?? 'unknown') ?? 0) * COL_WIDTH,
    y: i * ROW_HEIGHT,
    label: `${s.label ?? s.kind}${s.durationMs != null ? ` (${s.durationMs}ms)` : ''}`,
    kind: s.kind,
    executionStatus: s.executionStatus,
    resultKind: s.resultKind ?? null,
    callKey: s.callKey ?? null,
    childTraceId: s.childTraceId ?? null,
  }));
  const layoutEdges: LayoutEdge[] = [];
  for (const s of sorted) {
    if (s.parentSpanId) {
      layoutEdges.push({
        id: `req-${s.spanId}`,
        source: s.parentSpanId,
        target: s.spanId,
        direction: 'request',
        label: s.label ?? s.kind,
        executionStatus: s.executionStatus,
      });
    }
    if (hasObservedReturn(s, edges)) {
      layoutEdges.push({
        id: `ret-${s.spanId}`,
        source: s.spanId,
        target: s.parentSpanId ?? s.spanId,
        direction: 'return',
        label: s.executionStatus === 'error' ? 'error' : 'result',
        executionStatus: s.executionStatus,
      });
    }
  }
  return { nodes, layoutEdges, participants: ordered };
}

/** 步骤状态展示文案：executionStatus 与 resultKind 分开表达，不混用。 */
export function statusText(executionStatus: string, resultKind: string | null): string {
  const base = executionStatus;
  if (resultKind === 'business_error') return `${base} · 业务失败`;
  if (resultKind === 'system_error') return `${base} · 系统错误`;
  if (resultKind === 'unknown') return `${base} · 结果未知`;
  if (resultKind === 'ok') return `${base} · 业务成功`;
  return base;
}