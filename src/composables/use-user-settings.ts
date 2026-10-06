/**
 * 用户级组件设置同步（tasks-2610-0215-56 T3）
 *
 * 登录身份可用（config.auth.getToken）时，以服务端 /auth/profile/settings 为事实源：
 * - pullUserSettings：组件挂载时拉取，落地到本地存储通道（base_url / nl2sql_url / api_key）；
 *   换浏览器登录同账号即自动恢复（核心诉求）
 * - pushUserSetting：设置页保存后持久化到服务端（空值语义 = 恢复默认，服务端删行）
 *
 * 无身份时两者均为 no-op：行为与纯 localStorage 现状完全一致（窄域分支，不报错不重试）。
 *
 * 鉴权通道：仅用户 JWT（config.auth.getToken）——/auth/profile/settings 基于
 * 可信 X-User-Id 解析身份；API Key 无用户归属，不入本链路（T4 决策）。
 *
 * 优先级链（宿主下发 > 服务端用户设置 > localStorage > 默认）：
 * - 宿主显式 config.baseURL（非默认）或 syncParams 已下发地址时，跳过 base_url 的服务端回填；
 * - 宿主已注入凭据（auth.getToken / syncParams Key）时，跳过 api_key 的服务端回填——
 *   用户级 api_key 走「用户自存 Key」通道（setAiApiKey），不污染宿主下发通道（setHostAiApiKey）。
 */
import { getAiBaseUrl, setAiApiKey, setAiBaseUrl, getHostAiApiKey } from '../api/client';
import { getUserJwt } from '../api/auth';
import { getNl2sqlBaseUrl, setNl2sqlBaseUrl } from '../api/nl2sql';
import { useAiAssistantConfig } from '../providers';
import { getSyncedBaseUrl } from './use-settings-sync';

const SETTINGS_PATH = '/auth/profile/settings';
const DEFAULT_BASE_URL = '/ai-api';

export type PushResult = 'synced' | 'skipped' | 'failed';

function userToken(): string | null | undefined {
  try {
    // 优先宿主注入的用户 JWT 专用通道（getUserToken）；其次组件内置登录的用户 JWT
    // （tasks-2610-0212-46）。不回落 getToken——它可能是业务 API Key，无用户归属，
    // /auth/profile/settings 需要可信用户身份。
    return useAiAssistantConfig().auth?.getUserToken?.() ?? getUserJwt();
  } catch {
    return getUserJwt();
  }
}

/** 宿主是否显式锁定了服务地址（config.baseURL 非默认 或 syncParams 已下发） */
function hostOwnsBaseUrl(): boolean {
  try {
    const cfg = useAiAssistantConfig();
    if (cfg.baseURL && cfg.baseURL !== DEFAULT_BASE_URL) return true;
  } catch {
    // config 未就绪：按未锁定处理
  }
  return Boolean(getSyncedBaseUrl());
}

/** 宿主是否已注入凭据（auth.getToken / syncParams 下发的内存 Key） */
function hostOwnsCredential(): boolean {
  try {
    if (useAiAssistantConfig().auth?.getToken) return true;
  } catch {
    // config 未就绪：继续检查内存 Key
  }
  return Boolean(getHostAiApiKey());
}

function buildSettingsUrl(): string {
  const base = getAiBaseUrl().replace(/\/$/, '');
  return `${base}${SETTINGS_PATH}`;
}

async function settingsFetch(init: RequestInit): Promise<Response> {
  const token = userToken();
  if (!token) throw new Error('no-auth');
  const res = await fetch(buildSettingsUrl(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export interface PullResult {
  /** 是否有任一项从服务端落地本地 */
  applied: boolean;
  /** 服务端返回的运行值（原样透出，供调用方诊断） */
  settings: Record<string, string>;
}

/**
 * 拉取服务端用户设置并落地本地存储通道。
 * 无身份 / 网络失败 / 后端不可达：静默返回 applied=false（回落 localStorage 现状）。
 */
export async function pullUserSettings(): Promise<PullResult> {
  if (!userToken()) return { applied: false, settings: {} };
  try {
    const res = await settingsFetch({ method: 'GET' });
    const body = await res.json();
    const settings: Record<string, string> = body?.data?.settings ?? {};
    let applied = false;

    const baseUrl = settings['ai_assistant_base_url'];
    if (baseUrl !== undefined && !hostOwnsBaseUrl()) {
      setAiBaseUrl(baseUrl);
      applied = true;
    }

    const nl2sqlUrl = settings['ai_assistant_nl2sql_url'];
    if (nl2sqlUrl !== undefined) {
      setNl2sqlBaseUrl(nl2sqlUrl);
      applied = true;
    }

    // 用户级 api_key 走「用户自存 Key」通道；宿主已注入凭据时不覆盖（宿主下发优先）
    const apiKey = settings['ai_assistant_api_key'];
    if (apiKey && !hostOwnsCredential()) {
      setAiApiKey(apiKey);
      applied = true;
    }

    return { applied, settings };
  } catch {
    return { applied: false, settings: {} };
  }
}

/**
 * 推送单个设置项到服务端。
 * - 'skipped'：无登录身份（本地已生效，无需持久——现状语义）
 * - 'failed'：有身份但同步失败（调用方应显式提示，不谎报成功）
 */
export async function pushUserSetting(key: string, value: string): Promise<PushResult> {
  if (!userToken()) return 'skipped';
  try {
    await settingsFetch({ method: 'PUT', body: JSON.stringify({ [key]: value }) });
    return 'synced';
  } catch {
    return 'failed';
  }
}
