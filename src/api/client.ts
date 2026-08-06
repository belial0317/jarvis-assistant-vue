/**
 * AI 助手 API 请求客户端
 *
 * 改造说明：
 * - 原 client.ts 基于 @vben/request (axios) + @vben/stores + @vben/preferences
 * - 改造为内建 fetch 实现，通过 provider 注入获取鉴权/国际化配置
 * - 保留 aiRequestClient 公开 API（get/post/put/delete/patch/request/postSSE/stream）
 * - 保留 getAiBaseUrl/setAiBaseUrl/resetAiBaseUrl
 * - 保留 __silent 静默模式（探测性调用跳过错误提示）
 *
 * 后端响应结构约定：{ code: '0', data: ..., message: ... }
 * code='0' 表示成功，其他值表示业务错误。
 *
 * 网关规则：vite dev proxy / 生产网关均会剥离 `/ai-api` 前缀后转发到后端，
 * 后端 Controller 路径不含 `/ai-api`（如 `@RequestMapping("/chat")`）。
 *
 * 后端服务地址可在「AI 助手 -> 设置 -> 后端服务」中动态配置：
 * - 默认 `/ai-api`：走 vite dev proxy / 生产网关
 * - 自定义完整 URL（如 `http://192.168.1.100:8080`）：直连后端，绕过代理
 *
 * 静默模式：
 * - 单个请求可通过 `config.__silent = true` 跳过全局错误 toast
 * - 用于 /health/ping 等探测性调用，让调用方自行处理失败
 */
import { message } from 'ant-design-vue';

import { useAiAssistantConfig } from '../providers';

// ===== 后端服务地址动态配置（localStorage 持久化）=====

const AI_BASE_URL_STORAGE_KEY = 'ai_assistant_base_url';
const DEFAULT_AI_BASE_URL = '/ai-api';

/** 读取当前 AI 后端服务地址（未配置则返回默认 `/ai-api`） */
export function getAiBaseUrl(): string {
  return (
    (typeof localStorage !== 'undefined' &&
      localStorage.getItem(AI_BASE_URL_STORAGE_KEY)) ||
    DEFAULT_AI_BASE_URL
  );
}

/** 设置 AI 后端服务地址（空字符串视为恢复默认） */
export function setAiBaseUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed || trimmed === DEFAULT_AI_BASE_URL) {
    localStorage.removeItem(AI_BASE_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(AI_BASE_URL_STORAGE_KEY, trimmed);
  }
}

/** 恢复默认后端服务地址 */
export function resetAiBaseUrl(): void {
  localStorage.removeItem(AI_BASE_URL_STORAGE_KEY);
}

// ===== 请求配置类型 =====

interface AiRequestConfig {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** 静默模式：跳过全局错误提示（探测性调用） */
  __silent?: boolean;
  /** 请求体（request 方法使用） */
  data?: any;
}

interface AiSSEConfig {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  onMessage: (content: string) => void;
}

// ===== 内部工具函数 =====

function formatToken(token: string | null | undefined): string | null {
  return token ? `Bearer ${token}` : null;
}

/** 解析最终 baseURL：用户自定义地址优先，否则用 config.baseURL */
function resolveBaseURL(): string {
  const aiConfig = useAiAssistantConfig();
  const dynamicBaseURL = getAiBaseUrl();
  return dynamicBaseURL !== DEFAULT_AI_BASE_URL
    ? dynamicBaseURL
    : (aiConfig.baseURL ?? DEFAULT_AI_BASE_URL);
}

/** 构建公共请求头（鉴权 / 国际化 / 多租户） */
function buildHeaders(custom?: Record<string, string>): Record<string, string> {
  const aiConfig = useAiAssistantConfig();
  const headers: Record<string, string> = { ...custom };
  const token = aiConfig.auth?.getToken();
  const authHeader = formatToken(token);
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  headers['Accept-Language'] = aiConfig.locale?.getLocale() ?? 'zh-CN';
  // 多租户：默认 0（平台级），后续可由登录态注入
  if (!headers['X-Tenant-Id']) {
    headers['X-Tenant-Id'] = '0';
  }
  return headers;
}

/** 拼接 baseURL + url，并附加 query params */
function buildUrl(
  base: string,
  url: string,
  params?: Record<string, any>,
): string {
  const fullUrl = `${base}${url}`;
  if (!params) return fullUrl;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `${fullUrl}?${qs}` : fullUrl;
}

/** 错误提示：优先使用 config.onError 回调，不提供时 fallback 到 ant-design-vue message */
function showError(msg: string, silent?: boolean): void {
  if (silent) return;
  try {
    const aiConfig = useAiAssistantConfig();
    if (aiConfig.onError) {
      aiConfig.onError(msg);
      return;
    }
  } catch {
    // config 尚未初始化，降级到 ant-design-vue
  }
  message.error(msg);
}

// ===== 内建 fetch 请求实现 =====

async function doRequest<T>(
  url: string,
  method: string,
  data?: any,
  config?: AiRequestConfig,
): Promise<T> {
  const baseURL = resolveBaseURL();
  const headers = buildHeaders(config?.headers);

  // 请求体处理
  let body: BodyInit | undefined;
  if (data !== undefined && data !== null) {
    if (data instanceof FormData) {
      body = data;
      // 删除手动设置的 Content-Type，让浏览器自动添加 multipart/form-data + boundary
      delete headers['Content-Type'];
    } else {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(data);
    }
  }

  const finalUrl = buildUrl(baseURL, url, config?.params);

  let response: Response;
  try {
    response = await fetch(finalUrl, {
      method,
      headers,
      body,
      signal: config?.signal,
    });
  } catch (error) {
    // 网络错误（fetch rejected）
    const msg = error instanceof Error ? error.message : '网络请求失败';
    showError(msg, config?.__silent);
    throw error;
  }

  // HTTP 状态码错误
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData?.message ?? errorMessage;
    } catch {
      // 响应体非 JSON
    }
    showError(errorMessage, config?.__silent);
    throw new Error(errorMessage);
  }

  // 解析响应
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // 非 JSON 响应，直接返回文本
    const text = await response.text();
    return text as unknown as T;
  }

  const result = await response.json();

  // 业务码校验：后端 R 类返回 code 为字符串 "0"（非数字 0）表示成功
  if (result.code !== '0') {
    const msg = result.message ?? '请求失败';
    showError(msg, config?.__silent);
    throw new Error(msg);
  }

  return result.data as T;
}

/** SSE 流式请求（POST text/event-stream，ReadableStream reader 解析） */
async function doStream(
  url: string,
  method: string,
  data: any,
  config: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    onChunk?: (chunk: string) => void;
    onMessage?: (content: string) => void;
  },
): Promise<void> {
  const baseURL = resolveBaseURL();
  const headers = buildHeaders({
    Accept: 'text/event-stream',
    ...config.headers,
  });

  // 请求体
  let body: BodyInit | undefined;
  if (data !== undefined && data !== null) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    body = JSON.stringify(data);
  }

  const fullUrl = `${baseURL}${url}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      method,
      headers,
      body,
      signal: config.signal,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '网络请求失败';
    showError(msg, false);
    throw error;
  }

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData?.message ?? errorMessage;
    } catch {
      // 响应体非 JSON
    }
    showError(errorMessage, false);
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported in this environment');
  }

  // 兼容 onChunk / onMessage 两种回调命名
  const callback = config.onChunk ?? config.onMessage;
  const decoder = new TextDecoder();
  let done = false;
  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (value) {
      const text = decoder.decode(value, { stream: !done });
      callback?.(text);
    }
  }
}

// ===== 公开 API：aiRequestClient =====

export const aiRequestClient = {
  /** GET 请求 */
  get<T = any>(url: string, config?: AiRequestConfig): Promise<T> {
    return doRequest<T>(url, 'GET', undefined, config);
  },

  /** POST 请求 */
  post<T = any>(
    url: string,
    data?: any,
    config?: AiRequestConfig,
  ): Promise<T> {
    return doRequest<T>(url, 'POST', data, config);
  },

  /** PUT 请求 */
  put<T = any>(
    url: string,
    data?: any,
    config?: AiRequestConfig,
  ): Promise<T> {
    return doRequest<T>(url, 'PUT', data, config);
  },

  /** DELETE 请求 */
  delete<T = any>(url: string, config?: AiRequestConfig): Promise<T> {
    return doRequest<T>(url, 'DELETE', undefined, config);
  },

  /** PATCH 请求 */
  patch<T = any>(
    url: string,
    data?: any,
    config?: AiRequestConfig,
  ): Promise<T> {
    return doRequest<T>(url, 'PATCH', data, config);
  },

  /** 通用请求（method 由 config 指定） */
  request<T = any>(
    url: string,
    config: AiRequestConfig & { method: string },
  ): Promise<T> {
    return doRequest<T>(url, config.method, config.data, config);
  },

  /** SSE 流式 POST（兼容原有 postSSE 接口） */
  postSSE(
    url: string,
    data: any,
    config: AiSSEConfig,
  ): Promise<void> {
    return doStream(url, 'POST', data, config);
  },

  /** 通用流式请求（ReadableStream reader 解析 text/event-stream） */
  stream<T = any>(
    url: string,
    config: {
      method?: string;
      data?: any;
      signal?: AbortSignal;
      headers?: Record<string, string>;
      onChunk?: (chunk: string) => void;
    },
  ): Promise<void> {
    return doStream(url, config.method ?? 'GET', config.data, config);
  },
};
