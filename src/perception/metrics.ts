/**
 * S6/F1 感知质量度量:前端埋点旁路。
 *
 * - 异步批量:5s 定时或满 20 条即上报,fetch keepalive;主路径(采集/发送)零同步等待;
 * - 鉴权与业务请求同源:宿主 auth.getToken 优先,回落设置模块 apiKey
 *   (埋点端点要求认证,sendBeacon 无法携带自定义头故统一走 fetch);
 * - 失败重试上限 1 次,仍失败则丢弃(度量非业务事实,不吞业务错误);
 * - 全局开关:setMetricsEnabled(false) 后队列入但不上报(内存丢弃)。
 */

import { aiRequestClient } from '../api/client';

export interface PerceptionMetricEvent {
  /** 事件场景:capture|summary|feedback|intent */
  scene: 'capture' | 'feedback' | 'intent' | 'summary';
  routePath?: string;
  /** ok|fallback|empty|hit_cache|thumb_up|thumb_down */
  result?: string;
  strategy?: string;
  selectorHits?: number;
  chars?: number;
  stale?: boolean;
  label?: string;
}

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 5000;

let queue: PerceptionMetricEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let metricsEnabled = true;

export function setMetricsEnabled(enabled: boolean): void {
  metricsEnabled = enabled;
  if (!enabled) queue = [];
}

export function isMetricsEnabled(): boolean {
  return metricsEnabled;
}

/** 记录一条度量事件(非阻塞;开关关闭时直接丢弃) */
export function trackMetric(event: PerceptionMetricEvent): void {
  if (!metricsEnabled) return;
  queue.push(event);
  if (queue.length >= BATCH_SIZE) {
    void flush();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
  }
}

/** 批量上报:fetch keepalive(埋点端点需鉴权头);失败重试 1 次后丢弃 */
export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  // 统一 client 上报:自动携带鉴权头(宿主 auth.getToken 优先,回落 apiKey),
  // __silent 探测语义(失败不弹全局 toast)
  await aiRequestClient
    .post('/perception/metrics/batch', batch, { __silent: true })
    .catch(() => {
      // 重试一次;再失败即丢弃(度量旁路,不累积)
      return aiRequestClient
        .post('/perception/metrics/batch', batch, { __silent: true })
        .catch(() => undefined);
    });
}

// 页面卸载前 flush(keepalive 保证卸载后请求继续)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flush();
  });
}
