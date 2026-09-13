/**
 * tasks-2609-1400-10 增量：当前登录用户（服务端已脱敏，双平面身份均可调）。
 */
import { aiRequestClient } from './client';

export interface WhoamiVO {
  userId: string;
  username: string;
  phone: string;
  displayName: string;
  role: string;
}

export function fetchWhoami() {
  return aiRequestClient.get<WhoamiVO>('/user/whoami');
}
