/**
 * AI 助手后端连通性状态（单一状态源）
 *
 * 改造背景：
 * - 原 client.ts 全局 errorMessageResponseInterceptor 把任何非 200 响应都吐 toast，
 *   导致后端不通时抽屉打开瞬间被 4–5 条「内部服务器错误」toast 刷屏。
 * - StatusBar 的 connected 写死为 true，与事实不符。
 *
 * 行为约定：
 * - check() 主动 ping /health/ping（请求标记 __silent，不触发全局 toast）
 * - 30 秒内复用上次结果（避免抽屉反复打开反复 ping）
 * - 抽屉首次打开（state === 'idle'）立即触发一次 check
 * - 后端服务地址变更（settings 模块调用 invalidate）后强制 recheck
 *
 * 八荣八耻约束（§0.5）：
 * - 第 1 条：未把 health state 包装成"通用"横切 store，限定在 ai-assistant 命名空间
 * - 第 2 条：state 不会自动猜测为 connected，初次必须 ping
 * - 第 5 条：ping 失败原因显式分类（network / http / unknown），不静默吞掉
 * - 第 8 条：30s 防抖是显式设计，避免频繁请求
 */
import { ref, type Ref } from 'vue';

import { aiRequestClient } from '../api/client';
import { HealthApi } from '../api/endpoints';
import { healthPing, type HealthPingResult } from '../api/health';

export type BackendHealthState =
  | 'idle' // 尚未发起过 ping（抽屉未打开过 / 刚启动）
  | 'checking' // 正在 ping
  | 'connected' // 后端可达
  | 'disconnected'; // 后端不可达（reason 中有具体原因）

export interface BackendHealthSnapshot {
  state: BackendHealthState;
  /** 最近一次 ping 的耗时（毫秒），失败时为 undefined */
  latencyMs?: number;
  /** 最近一次 ping 的 Unix 毫秒时间戳，未曾成功过为 undefined */
  lastCheckedAt?: number;
  /** 失败原因（state === 'disconnected' 时有意义） */
  reason?: 'network' | 'http' | 'timeout' | 'unknown';
  /** 后端报告的 service 名（如 'jarvis-ai-sys-server'） */
  service?: string;
}

const CACHE_TTL_MS = 30_000;

const snapshot: Ref<BackendHealthSnapshot> = ref({
  state: 'idle',
});

let pendingCheck: Promise<BackendHealthSnapshot> | null = null;

/**
 * 将 fetch / 自定义适配器抛出的异常归类为可读 reason。
 *
 * 内建 fetch 错误特征：
 * - 网络不可达：TypeError: Failed to fetch（error.name === 'TypeError'）
 * - 主动中断：AbortError
 * - HTTP 层错误：doRequest/doStream 抛出的 Error，message 以 "HTTP " 开头
 */
function classifyError(error: any): BackendHealthSnapshot['reason'] {
  if (!error) return 'unknown';
  const name = error?.name;
  const msg = typeof error?.message === 'string' ? error.message : '';
  // 主动中断（超时/取消）
  if (name === 'AbortError' || msg.includes('timeout')) {
    return 'timeout';
  }
  // 网络层失败（fetch rejected）
  if (name === 'TypeError' || msg.includes('fetch') || msg.includes('Failed to fetch')) {
    return 'network';
  }
  // HTTP 状态码错误
  if (msg.startsWith('HTTP ')) {
    return 'http';
  }
  // 兼容自定义 adapter 抛出的带 status 的错误
  if (typeof error?.status === 'number' || typeof error?.response?.status === 'number') {
    return 'http';
  }
  return 'unknown';
}

/**
 * 主动 ping 后端。
 * - 多个并发调用复用同一 Promise（避免抽屉打开瞬间并发 ping）
 * - 命中 30s TTL 且 state !== idle 时直接返回缓存
 * - 单请求标记 __silent，不触发全局 toast
 */
export async function checkBackendHealth(force = false): Promise<BackendHealthSnapshot> {
  // 命中缓存
  if (
    !force &&
    snapshot.value.state !== 'idle' &&
    snapshot.value.lastCheckedAt !== undefined &&
    Date.now() - snapshot.value.lastCheckedAt < CACHE_TTL_MS
  ) {
    return snapshot.value;
  }

  // 复用正在进行的 ping
  if (pendingCheck) {
    return pendingCheck;
  }

  snapshot.value = { ...snapshot.value, state: 'checking' };
  const startedAt = Date.now();
  pendingCheck = (async () => {
    try {
      const data: HealthPingResult = await aiRequestClient.get<HealthPingResult>(
        HealthApi.PING,
        { __silent: true },
      );
      const latencyMs = Date.now() - startedAt;
      const ok = data?.status === 'UP' || data?.status === 'ok';
      snapshot.value = ok
        ? {
            state: 'connected',
            latencyMs,
            lastCheckedAt: Date.now(),
            service: data?.service,
          }
        : {
            state: 'disconnected',
            lastCheckedAt: Date.now(),
            reason: 'http',
            service: data?.service,
          };
    } catch (error: any) {
      snapshot.value = {
        state: 'disconnected',
        lastCheckedAt: Date.now(),
        reason: classifyError(error),
      };
    } finally {
      pendingCheck = null;
    }
    return snapshot.value;
  })();

  return pendingCheck;
}

/**
 * 失效缓存并强制重检（用于设置页修改 baseURL 后调用）
 */
export function invalidateBackendHealth(): void {
  snapshot.value = { state: 'idle' };
}

/**
 * 获取响应式 state 供模板直接绑定。
 * 同一模块多次调用拿到的是同一个 ref（共享 snapshot），状态天然一致。
 */
export function useBackendHealth(): Ref<BackendHealthSnapshot> {
  return snapshot;
}

/** 重新导出 ping 函数，方便外部直接做"一次性探测" */
export { healthPing };
