/**
 * 定时任务 API（方案 P0）
 */
import { ChatApi, path } from './endpoints';
import { aiRequestClient } from './client';

export interface AgentScheduleVO {
  id: string;
  name: string;
  sessionId: string;
  agentId?: string;
  prompt: string;
  scheduleType: 'cron' | 'once';
  cronExpr?: string;
  runAt?: string;
  timezone?: string;
  status: 'active' | 'paused' | 'done' | 'failed' | 'archived';
  failCount?: number;
  runCount?: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastResult?: string;
}

const BASE = '/schedules';

export function listSchedules(): Promise<AgentScheduleVO[]> {
  return aiRequestClient.get<AgentScheduleVO[]>(BASE);
}

export function createSchedule(payload: Record<string, unknown>): Promise<AgentScheduleVO> {
  return aiRequestClient.post<AgentScheduleVO>(BASE, payload);
}

export function updateSchedule(
  id: string,
  payload: Record<string, unknown>,
): Promise<AgentScheduleVO> {
  return aiRequestClient.put<AgentScheduleVO>(`${BASE}/${id}`, payload);
}

export function pauseSchedule(id: string): Promise<void> {
  return aiRequestClient.post<void>(`${BASE}/${id}/pause`);
}

export function resumeSchedule(id: string): Promise<void> {
  return aiRequestClient.post<void>(`${BASE}/${id}/resume`);
}

export function runScheduleNow(id: string): Promise<void> {
  return aiRequestClient.post<void>(`${BASE}/${id}/run`);
}

export function deleteSchedule(id: string): Promise<void> {
  return aiRequestClient.delete<void>(`${BASE}/${id}`);
}

// 保持 endpoints 引用（与既有 api 文件风格一致）
void ChatApi;
void path;
