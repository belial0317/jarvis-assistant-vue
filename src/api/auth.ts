/**
 * 组件内置登录（tasks-2610-0212-46）
 *
 * 对齐控制台登录方式：账号密码 / 短信验证码 / API Key。
 * 架构事实：管理面（/auth、/api-tokens）走用户 JWT；数据面（/chat）走 API Key ——
 * 因此账号/验证码登录成功后，自动拉取本人 active API Key 作为业务凭据（对话可用闭环）。
 *
 * 用户态持久化：localStorage `ai_assistant_user_auth`（accessToken + refreshToken；
 * 本期不做 401 自动刷新，记后续任务）。API Key 登录不产生用户身份，仅本浏览器生效。
 */
const USER_AUTH_KEY = 'ai_assistant_user_auth';

export interface ComponentUserAuth {
  username: string;
  displayName?: string;
  role?: string;
  userId?: string;
  accessToken: string;
  refreshToken?: string;
  loginAt: number;
}

export function getUserAuth(): ComponentUserAuth | null {
  try {
    const raw = localStorage.getItem(USER_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComponentUserAuth;
    return parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

/** 当前登录用户的 accessToken（未登录返回 null） */
export function getUserJwt(): string | null {
  return getUserAuth()?.accessToken ?? null;
}

export function setUserAuth(auth: ComponentUserAuth): void {
  localStorage.setItem(USER_AUTH_KEY, JSON.stringify(auth));
}

export function clearUserAuth(): void {
  localStorage.removeItem(USER_AUTH_KEY);
}

/** 通知宿主/组件内部凭据状态变化（登录/登出后刷新门控） */
export function notifyCredentialsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ai-credentials-changed'));
  }
}

// ===== R 响应解包（code 兼容 "0"/0） =====

interface REnvelope<T> {
  code: string | number;
  data: T;
  message?: string;
}

async function postR<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as REnvelope<T>;
  if (!res.ok || `${json.code}` !== '0') {
    throw new Error(json.message || `请求失败（HTTP ${res.status}）`);
  }
  return json.data;
}

async function getR<T>(base: string, path: string, jwt: string): Promise<T> {
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const json = (await res.json()) as REnvelope<T>;
  if (!res.ok || `${json.code}` !== '0') {
    throw new Error(json.message || `请求失败（HTTP ${res.status}）`);
  }
  return json.data;
}

// ===== 登录方式 =====

export interface LoginResult {
  auth: ComponentUserAuth;
  /** 登录后自动绑定的业务 API Key（用户名下无 active key 时为 null） */
  businessKey: string | null;
}

async function establishUserSession(
  base: string,
  data: {
    accessToken: string;
    refreshToken?: string;
    userId?: string;
    displayName?: string;
    role?: string;
    username?: string;
  },
): Promise<LoginResult> {
  const auth: ComponentUserAuth = {
    username: data.username ?? '',
    displayName: data.displayName,
    role: data.role,
    userId: data.userId,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    loginAt: Date.now(),
  };
  setUserAuth(auth);
  // 数据面凭据闭环：拉本人 active API Key（控制台创建过才有；没有时业务 key 为空，
  // 由登录卡片提示去门户控制台创建或经设置页手填）
  let businessKey: string | null = null;
  try {
    businessKey = await fetchUserBusinessKey(base, auth.accessToken);
    if (businessKey) {
      const { setAiApiKey } = await import('./client');
      setAiApiKey(businessKey);
    }
  } catch {
    // 无 key / 端点异常不阻断登录：登录本身已成功
  }
  notifyCredentialsChanged();
  return { auth, businessKey };
}

/** 账号登录（用户名 + 密码） */
export async function loginByUsername(
  base: string,
  username: string,
  password: string,
): Promise<LoginResult> {
  const data = await postR<{
    accessToken: string;
    refreshToken?: string;
    userId?: string;
    displayName?: string;
    role?: string;
    username?: string;
  }>(base, '/auth/login', { username, password });
  return establishUserSession(base, { ...data, username });
}

/** 发送短信验证码 */
export async function sendSmsCode(base: string, phone: string): Promise<void> {
  await postR(base, '/auth/sms/send', { phone });
}

/** 验证码登录 */
export async function loginBySmsCode(
  base: string,
  phone: string,
  code: string,
): Promise<LoginResult> {
  const data = await postR<{
    accessToken: string;
    refreshToken?: string;
    userId?: string;
    displayName?: string;
    role?: string;
    username?: string;
  }>(base, '/auth/login/sms', { phone, code });
  return establishUserSession(base, { ...data, username: phone });
}

/** API Key 校验（/host-keys/validate；HTTP 200 + code=0 视为有效） */
export async function validateApiKeyOnBackend(base: string, key: string): Promise<void> {
  const b = (base).replace(/\/$/, '');
  const res = await fetch(`${b}/host-keys/validate?key=${encodeURIComponent(key)}`);
  const json = (await res.json().catch(() => ({}))) as REnvelope<unknown>;
  if (!res.ok || `${json.code}` !== '0') {
    throw new Error(json.message || 'API Key 校验未通过');
  }
}

// ===== 登录后的业务 Key 自动绑定 =====

interface ApiTokenVO {
  id: string;
  status?: string;
  name?: string;
}

/** 拉取本人 API Key 列表 → 取第一把 active 的明文（/api-tokens/{id}/reveal-plain，本人限权） */
export async function fetchUserBusinessKey(base: string, jwt: string): Promise<string | null> {
  const b = (base).replace(/\/$/, '');
  const page = await getR<{ records?: ApiTokenVO[] }>(b, '/api-tokens/list?size=20', jwt);
  const active = (page?.records ?? []).find((t) => t.status === 'active');
  if (!active) return null;
  const plain = await getR<string>(b, `/api-tokens/${active.id}/reveal-plain`, jwt);
  return plain || null;
}
