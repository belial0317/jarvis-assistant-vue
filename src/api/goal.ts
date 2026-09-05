/**
 * S7/F2 感知目标 API:列表 / 建卡 / 报告 / 归档 / 调度触发。
 */

import { aiRequestClient } from './client';

export interface PerceptionGoalVO {
  id: string;
  routePattern: string;
  goalText: string;
  source: 'admin' | 'rule' | 'judge';
  /** 后端全局契约 write-numbers-as-strings:数字字段序列化为字符串 */
  priority: string | number;
  pageWeight: string | number;
  status: 'active' | 'archived';
  metricSnapshot?: string;
  failStreak: string | number;
  passStreak: string | number;
  createTime?: string;
}

export interface PerceptionGoalCreateDTO {
  routePattern: string;
  goalText: string;
  pageWeight?: number;
}

export interface PerceptionGoalReport {
  goal: PerceptionGoalVO;
  recentScores: Array<{ score: number; at: string }>;
  metricHint?: string;
}

export function listGoals() {
  return aiRequestClient.get<PerceptionGoalVO[]>('/perception/goals');
}

export function createGoal(dto: PerceptionGoalCreateDTO) {
  return aiRequestClient.post<number>('/perception/goals', dto, { __silent: false });
}

export function getGoalReport(id: string) {
  return aiRequestClient.get<PerceptionGoalReport>(`/perception/goals/${id}/report`);
}

export function archiveGoal(id: string) {
  return aiRequestClient.post<void>(`/perception/goals/${id}/archive`);
}

/** 手动触发规则建卡 + 优先级重算(返回处理目标数) */
export function runGoalScheduler() {
  return aiRequestClient.post<number>('/perception/goals/scheduler/run');
}

/** F1 度量汇总(近 7 天,按路由聚合) */
export function getMetricsSummary(window = '7d') {
  return aiRequestClient.get<Array<Record<string, unknown>>>(
    '/perception/metrics/summary',
    { params: { window } },
  );
}

// ===== S8/F3:草稿审批流与 QA 沉淀 =====

export interface PerceptionDraftVO {
  id: string;
  goalId?: string;
  source: string;
  payload: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: string;
  rejectReason?: string;
  createTime?: string;
}

export interface PerceptionFewshotVO {
  id: string;
  routePattern: string;
  question: string;
  answer: string;
  tags?: string;
  score: number;
  enabled: boolean;
}

export function listDrafts(status = 'pending') {
  return aiRequestClient.get<PerceptionDraftVO[]>('/perception/drafts', { params: { status } });
}

export function createDraft(dto: { goalId?: string; source?: string; payload: string }) {
  return aiRequestClient.post<number>('/perception/drafts', dto, { __silent: true });
}

export function approveDraft(id: string) {
  return aiRequestClient.post<number>(`/perception/drafts/${id}/approve?reviewer=portal-admin`);
}

export function rejectDraft(id: string, reason?: string) {
  return aiRequestClient.post<void>(`/perception/drafts/${id}/reject?reason=${encodeURIComponent(reason ?? '')}`);
}

export function listFewshots() {
  return aiRequestClient.get<PerceptionFewshotVO[]>('/perception/fewshots');
}

export function saveFewshot(dto: Partial<PerceptionFewshotVO>) {
  return aiRequestClient.post<number>('/perception/fewshots', dto, { __silent: true });
}

export function removeFewshot(id: string) {
  return aiRequestClient.delete(`/perception/fewshots/${id}`);
}
