/**
 * SDK 升级检查（tasks-2609-1715-49 T3）
 *
 * 数据源仅后端：GET /api-token/sdk-version?channel=<channel>（不用 npm registry）。
 * 检查时机（用户决策）：首次加载组件 + 每次打开面板各一次；无 TTL 长缓存；
 * in-flight Promise 去重避免触发点重叠重复请求。
 * 静默失败：无后端/未鉴权/网络错误/非法版本 → null，不打扰用户。
 */
import { aiRequestClient } from '../api/client';
import { useAiAssistantConfig } from '../providers/inject';

/** 升级提醒信息（hasUpdate=true 时 UI 消费） */
export interface SdkUpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  /** 对应版本 GitHub Release 地址；null=无链接（UI 降级为纯文案） */
  changelogUrl: string | null;
}

/** semver x.y.z 校验（支持 build metadata +hash，不支持预发布段） */
const SEMVER_RE = /^\d+\.\d+\.\d+/;

let inflight: Promise<SdkUpdateInfo | null> | null = null;

/** 当前 SDK 版本（构建期注入；CI 发布时为 <tag>+<shortsha>） */
export function getSdkVersion(): string {
  return typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0-dev';
}

/** SDK 渠道（构建参数 SDK_CHANNEL；config.sdk.channel 可覆盖） */
export function getSdkChannel(): 'oss' | 'commercial' {
  const cfg = safeConfig()?.sdk?.channel;
  if (cfg === 'oss' || cfg === 'commercial') return cfg;
  return typeof __SDK_CHANNEL__ !== 'undefined' ? __SDK_CHANNEL__ : 'oss';
}

/** npm包名 */
export function getSdkPackage(): string {
  return typeof __SDK_PACKAGE__ !== 'undefined' ? __SDK_PACKAGE__ : '@jarvis/ai-assistant';
}

/**
 * 检查是否有新版本。
 * - disableCheck=true → null
 * - in-flight 去重：并发触发共享同一 Promise
 * - 任何失败/无更新 → null
 */
export function checkSdkUpdate(): Promise<SdkUpdateInfo | null> {
  if (safeConfig()?.sdk?.disableCheck) return Promise.resolve(null);
  if (inflight) return inflight;
  inflight = doCheck().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doCheck(): Promise<SdkUpdateInfo | null> {
  try {
    const cfg = safeConfig();
    const url = cfg?.sdk?.checkUrl ?? '/api-token/sdk-version';
    const data = await aiRequestClient.get<{
      latestVersion?: string;
      changelogUrl?: string | null;
    } | null>(url, { params: { channel: getSdkChannel() }, __silent: true });

    const latest = data?.latestVersion;
    if (!latest || !SEMVER_RE.test(latest)) return null;

    // build metadata（+hash）不参与比较：0.2.0+abc == 0.2.0
    if (compareVersion(getSdkVersion(), latest) >= 0) return null;

    return {
      hasUpdate: true,
      latestVersion: latest,
      changelogUrl: cfg?.sdk?.changelogUrl ?? data?.changelogUrl ?? null,
    };
  } catch {
    // 静默失败：无后端/未鉴权/网络错误均不打扰
    return null;
  }
}

function safeConfig() {
  try {
    return useAiAssistantConfig();
  } catch {
    return null;
  }
}

/**
 * x.y.z 数值比较：a>b → 正数，a<b → 负数，相等 → 0。
 * build metadata（+hash）忽略；非法段按 fail-safe（不抛错，按低值处理）。
 */
export function compareVersion(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

function parseSemver(v: string): number[] {
  const out = [0, 0, 0];
  if (!v) return out;
  const core = v.split('+')[0].split('-')[0];
  const parts = core.split('.');
  for (let i = 0; i < parts.length && i < 3; i++) {
    const n = Number.parseInt(parts[i], 10);
    out[i] = Number.isNaN(n) ? -1 : n; // -1：非法段视为低于任何合法段
  }
  return out;
}
