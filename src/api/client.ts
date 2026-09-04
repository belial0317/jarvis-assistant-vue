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
  if (typeof localStorage === 'undefined') return;
  const trimmed = url.trim();
  if (!trimmed || trimmed === DEFAULT_AI_BASE_URL) {
    localStorage.removeItem(AI_BASE_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(AI_BASE_URL_STORAGE_KEY, trimmed);
  }
}

/** 恢复默认后端服务地址 */
export function resetAiBaseUrl(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AI_BASE_URL_STORAGE_KEY);
}

// ===== API Key 动态配置（localStorage 持久化）=====

const AI_API_KEY_STORAGE_KEY = 'ai_assistant_api_key';

/** 读取用户在设置页配置的 API Key（未配置返回 null） */
export function getAiApiKey(): null | string {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AI_API_KEY_STORAGE_KEY);
}

/** 保存 API Key（空字符串 / 非字符串视为清除） */
export function setAiApiKey(key: string): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(AI_API_KEY_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(AI_API_KEY_STORAGE_KEY);
  }
}

/** 清除已配置的 API Key（回落到宿主注入的默认凭据） */
export function resetAiApiKey(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AI_API_KEY_STORAGE_KEY);
}

/** API Key 脱敏展示（保留 sk-jarvis 前缀可辨识，长度不足则全掩码） */
export function maskAiApiKey(key: string): string {
  if (key.length <= 11) return '***';
  return `${key.slice(0, 11)}***`;
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
  /** 可选：接收结构化 SSE 事件（type + data） */
  onEvent?: (event: { type: string; data: string }) => void;
}

// ===== 内部工具函数 =====

function formatToken(token: string | null | undefined): string | null {
  return token ? `Bearer ${token}` : null;
}

/** 解析最终 baseURL：config.baseURL > localStorage 动态地址 > 默认值 */
function resolveBaseURL(): string {
  const aiConfig = useAiAssistantConfig();
  const configBaseURL = aiConfig.baseURL;
  // 如果 config 显式提供了 baseURL，优先使用它
  if (configBaseURL && configBaseURL !== DEFAULT_AI_BASE_URL) {
    return configBaseURL;
  }
  const dynamicBaseURL = getAiBaseUrl();
  return dynamicBaseURL !== DEFAULT_AI_BASE_URL
    ? dynamicBaseURL
    : (configBaseURL ?? DEFAULT_AI_BASE_URL);
}

/** 构建公共请求头（鉴权 / 国际化） */
function buildHeaders(custom?: Record<string, string>): Record<string, string> {
  const aiConfig = useAiAssistantConfig();
  const headers: Record<string, string> = { ...custom };
  // 鉴权链：宿主注入 config.auth 优先；回落设置模块本地 Key。
  // 必须双通道：异步回调（点击 / await 之后）里 inject 拿到的是宿主全局兜底配置，
  // 该配置往往没有 auth——此时设置页配置的 Key（门户运营平台分配）是唯一凭证。
  const token = aiConfig.auth?.getToken?.() ?? getAiApiKey();
  const authHeader = formatToken(token);
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  headers['Accept-Language'] = aiConfig.locale?.getLocale() ?? 'zh-CN';
  // 租户头仅在宿主显式提供时发送；服务端对已认证请求以凭证内租户为准（防伪造）
  const tenantId = aiConfig.auth?.getTenantId?.();
  if (tenantId !== null && tenantId !== undefined && !headers['X-Tenant-Id']) {
    headers['X-Tenant-Id'] = String(tenantId);
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

// ===== SSE 协议解析 =====

interface SSEEvent {
  event: string;
  data: string;
}

/**
 * 从 SSE 文本缓冲区中提取完整事件。
 * 返回已解析的事件列表和剩余未完成的文本。
 *
 * SSE 规范要点：
 * - 事件以 `\n\n` 分隔
 * - 字段名大小写敏感（如 `data:`、`event:`、`id:`、`retry:`）
 * - 多行 data 字段用 `\n` 拼接：例如 `data: foo\ndata: bar` 实际 data 为 "foo\nbar"
 * - 注释行以 `:` 开头，可忽略
 */
function extractSSEEvents(buffer: string): { events: SSEEvent[]; remainder: string } {
  const events: SSEEvent[] = [];
  let cursor = 0;

  while (true) {
    const endIndex = buffer.indexOf('\n\n', cursor);
    if (endIndex === -1) break;

    const rawBlock = buffer.slice(cursor, endIndex);
    cursor = endIndex + 2;

    const lines = rawBlock.split('\n');
    let eventType = 'message';
    const dataParts: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) {
        // 注释行，忽略
        continue;
      }
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data: ')) {
        dataParts.push(line.slice(6));
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5));
      }
    }
    events.push({ event: eventType, data: dataParts.join('\n') });
  }

  return { events, remainder: buffer.slice(cursor) };
}

// ===== 内建 fetch 请求实现 =====

async function doRequest<T>(
  url: string,
  method: string,
  data?: any,
  config?: AiRequestConfig,
): Promise<T> {
  const aiConfig = useAiAssistantConfig();

  // 优先使用宿主注入的 HttpAdapter
  if (aiConfig.http?.request) {
    const adapterResult = await aiConfig.http.request<T>({
      url,
      method: method as 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
      data,
      params: config?.params,
      headers: config?.headers,
      signal: config?.signal,
      silent: config?.__silent,
    });
    if (adapterResult.code !== '0') {
      const msg = adapterResult.message ?? '请求失败';
      showError(msg, config?.__silent);
      throw new Error(msg);
    }
    return adapterResult.data as T;
  }

  const baseURL = resolveBaseURL();
  const headers = buildHeaders(config?.headers);

  // 请求体处理
  let body: BodyInit | undefined;
  if (data !== undefined && data !== null) {
    if (data instanceof FormData) {
      body = data;
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

/** SSE 流式请求，按 text/event-stream 协议解析事件 */
async function doStream(
  url: string,
  method: string,
  data: any,
  config: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    onChunk?: (chunk: string) => void;
    onMessage?: (content: string) => void;
    onEvent?: (event: { type: string; data: string }) => void;
  },
): Promise<void> {
  const aiConfig = useAiAssistantConfig();

  // 优先使用宿主注入的 HttpAdapter
  if (aiConfig.http?.request) {
    await aiConfig.http.request({
      url,
      method: method as 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
      data,
      headers: config.headers,
      signal: config.signal,
      stream: true,
      onChunk: config.onChunk ?? config.onMessage,
    });
    return;
  }

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
    // 响应体可能不是 JSON（SSE 流被异常中断、空响应、网关错误页等），
    // 用 text() 兜底读取，保留原始内容便于诊断
    try {
      const rawText = await response.text();
      if (rawText) {
        // 尝试按 JSON 解析
        try {
          const errorData = JSON.parse(rawText);
          errorMessage = errorData?.message ?? errorMessage;
        } catch {
          // 不是 JSON：取前 200 字符作为提示，避免超长文本撑爆 UI
          const snippet = rawText.slice(0, 200).replace(/\s+/g, ' ').trim();
          if (snippet) {
            errorMessage = `${errorMessage} · ${snippet}`;
          }
        }
      }
    } catch {
      // 读取 body 失败（例如已关闭），保持默认错误信息
    }
    showError(errorMessage, false);
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported in this environment');
  }

  const callback = config.onChunk ?? config.onMessage;
  const onEvent = config.onEvent;
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (value) {
      const text = decoder.decode(value, { stream: !done });
      buffer += text;

      // 提取完整 SSE 事件
      const { events, remainder } = extractSSEEvents(buffer);
      buffer = remainder;

      for (const event of events) {
        if (onEvent) {
          onEvent({ type: event.event, data: event.data });
        }
        // 向后兼容：onChunk/onMessage 收到 data 字段内容
        callback?.(event.data);
      }
    }
  }
}

// ===== 公开 API：aiRequestClient =====

/** ETag 版本化 GET 的结果（PP3 manifest 拉取专用） */
export interface EtagResult<T> {
  /** true = 服务端 304，内容未变，沿用本地缓存 */
  notModified: boolean;
  /** 200 时的业务数据 */
  data?: T;
  /** 服务端返回的 ETag（304 与 200 均携带），透传给下次 If-None-Match */
  etag?: string;
}

export const aiRequestClient = {
  /**
   * PP3：带 If-None-Match 的 GET，处理 304 分支并透出响应 ETag。
   * 注意：宿主注入 HttpAdapter 时降级为普通请求（无 304 优化，行为等价）。
   */
  async getWithEtag<T = any>(
    url: string,
    etag?: string,
  ): Promise<EtagResult<T>> {
    const aiConfig = useAiAssistantConfig();
    if (aiConfig.http?.request) {
      // HttpAdapter 无 ETag 语义：退化为普通 GET，etag 返回 undefined
      const data = await doRequest<T>(url, 'GET', undefined);
      return { notModified: false, data };
    }

    const baseURL = resolveBaseURL();
    const headers = buildHeaders(
      etag ? { 'If-None-Match': etag } : undefined,
    );
    const response = await fetch(buildUrl(baseURL, url), {
      method: 'GET',
      headers,
    });

    const responseEtag = response.headers.get('etag') ?? undefined;
    if (response.status === 304) {
      return { notModified: true, etag: responseEtag ?? etag };
    }
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData?.message ?? errorMessage;
      } catch {
        // 非 JSON 响应体
      }
      throw new Error(errorMessage);
    }
    const result = await response.json();
    if (result.code !== '0') {
      throw new Error(result.message ?? '请求失败');
    }
    return { notModified: false, data: result.data as T, etag: responseEtag };
  },

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
      onEvent?: (event: { type: string; data: string }) => void;
    },
  ): Promise<void> {
    return doStream(url, config.method ?? 'GET', config.data, config);
  },
};