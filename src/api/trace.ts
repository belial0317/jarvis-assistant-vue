/**
 * AI 助手 API：执行轨迹（智能体路径诊断器）
 *
 * 对齐后端契约（tasks-2609-2316-45）：
 *   GET /chat/messages/{messageId}/trace        概览 + span摘要分页
 *   GET /chat/traces/{traceId}/spans/{spanId}   单步详情（按需读取）
 *
 * wire 说明：服务端全局 write-numbers-as-strings=true，
 * durationMs/sequenceNo 等数值在 wire 上为 string，此处归一化为 number。
 */
import { aiRequestClient } from './client';

/** span 摘要（对齐 TraceSpanVO） */
export interface TraceSpan {
  spanId: string;
  parentSpanId?: string | null;
  sequenceNo: number;
  runId?: string;
  kind: string;
  label?: string;
  fromParticipantId?: string;
  toParticipantId?: string;
  executionStatus: string;
  resultKind?: string | null;
  callKey?: string | null;
  childTraceId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationMs?: number | null;
}

/** 轨迹概览（对齐 TraceOverviewVO） */
export interface TraceOverview {
  traceId?: string;
  messageId: string;
  sessionId: string;
  userId?: string;
  rootRunId?: string;
  /** runStatus/integrity 为独立事实 */
  runStatus?: string | null;
  integrity: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  /** summaryJson/childRunIdsJson 为原始 JSON 字符串 */
  summaryJson?: string | null;
  childRunIdsJson?: string | null;
  truncated?: boolean | null;
  spans: TraceSpan[];
  cursor?: string | null;
  hasMore: boolean;
}

/** 单步详情（对齐 TraceSpanDetailVO；JSON 块为原始 JSON 字符串） */
export interface TraceSpanDetail {
  spanId: string;
  traceId: string;
  kind?: string;
  executionStatus?: string;
  resultKind?: string | null;
  durationMs?: number | null;
  inputJson?: string | null;
  outputJson?: string | null;
  errorJson?: string | null;
  configSnapshotJson?: string | null;
  eventsJson?: string | null;
}

/** U1：@JsonRawValue 字段在部分序列化路径下可能已是对象——统一归一化为 JSON 字符串 */
function toJsonString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function toNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSpan(raw: Record<string, unknown>): TraceSpan {
  return {
    spanId: String(raw.spanId ?? ''),
    parentSpanId: raw.parentSpanId == null ? null : String(raw.parentSpanId),
    sequenceNo: toNumber(raw.sequenceNo) ?? 0,
    runId: raw.runId == null ? undefined : String(raw.runId),
    kind: String(raw.kind ?? ''),
    label: raw.label == null ? undefined : String(raw.label),
    fromParticipantId: raw.fromParticipantId == null ? undefined : String(raw.fromParticipantId),
    toParticipantId: raw.toParticipantId == null ? undefined : String(raw.toParticipantId),
    executionStatus: String(raw.executionStatus ?? ''),
    resultKind: raw.resultKind == null ? null : String(raw.resultKind),
    callKey: raw.callKey == null ? null : String(raw.callKey),
    childTraceId: raw.childTraceId == null ? null : String(raw.childTraceId),
    startAt: raw.startAt == null ? null : String(raw.startAt),
    endAt: raw.endAt == null ? null : String(raw.endAt),
    durationMs: toNumber(raw.durationMs) ?? null,
  };
}

function normalizeOverview(raw: Record<string, unknown>): TraceOverview {
  const spans = Array.isArray(raw.spans) ? (raw.spans as Record<string, unknown>[]).map(normalizeSpan) : [];
  return {
    traceId: raw.traceId == null ? undefined : String(raw.traceId),
    messageId: String(raw.messageId ?? ''),
    sessionId: String(raw.sessionId ?? ''),
    userId: raw.userId == null ? undefined : String(raw.userId),
    rootRunId: raw.rootRunId == null ? undefined : String(raw.rootRunId),
    runStatus: raw.runStatus == null ? null : String(raw.runStatus),
    integrity: String(raw.integrity ?? 'missing'),
    startedAt: raw.startedAt == null ? null : String(raw.startedAt),
    endedAt: raw.endedAt == null ? null : String(raw.endedAt),
    durationMs: toNumber(raw.durationMs) ?? null,
    summaryJson: raw.summaryJson == null ? null : String(raw.summaryJson),
    childRunIdsJson: raw.childRunIdsJson == null ? null : String(raw.childRunIdsJson),
    truncated: raw.truncated == null ? null : Boolean(raw.truncated),
    spans,
    cursor: raw.cursor == null ? null : String(raw.cursor),
    hasMore: Boolean(raw.hasMore ?? false),
  };
}

/** 消息执行轨迹概览（cursor=上一页最后 sequenceNo；null=第一页） */
export async function getMessageTrace(messageId: string, cursor?: number | null): Promise<TraceOverview> {
  const params = cursor != null ? { cursor } : undefined;
  const res = await aiRequestClient.get<Record<string, unknown>>(`/chat/messages/${messageId}/trace`, { params });
  return normalizeOverview(res as Record<string, unknown>);
}

/** 单步详情（按需读取） */
export async function getTraceSpanDetail(traceId: string, spanId: string): Promise<TraceSpanDetail> {
  const res = await aiRequestClient.get<Record<string, unknown>>(`/chat/traces/${traceId}/spans/${spanId}`);
  return {
    spanId: String(res?.spanId ?? ''),
    traceId: String(res?.traceId ?? ''),
    kind: res?.kind == null ? undefined : String(res.kind),
    executionStatus: res?.executionStatus == null ? undefined : String(res.executionStatus),
    resultKind: res?.resultKind == null ? undefined : String(res.resultKind),
    durationMs: res?.durationMs == null ? undefined : Number(res.durationMs),
    inputJson: toJsonString(res?.inputJson),
    outputJson: toJsonString(res?.outputJson),
    errorJson: toJsonString(res?.errorJson),
    configSnapshotJson: toJsonString(res?.configSnapshotJson),
    eventsJson: toJsonString(res?.eventsJson),
  };
}
