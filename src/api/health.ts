/**
 * AI 助手 API：健康检查（联调冒烟用）
 */
import { aiRequestClient } from './client';
import { HealthApi } from './endpoints';

export interface HealthPingResult {
  status: string;
  service: string;
  timestamp: number;
}

/** 联调冒烟：调用后端 /health/ping */
export function healthPing() {
  return aiRequestClient.get<HealthPingResult>(HealthApi.PING);
}
