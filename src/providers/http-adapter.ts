/**
 * HTTP 适配器抽象
 *
 * 宿主可注入自定义 HTTP client（如 axios、@vben/request 等），
 * 不提供时使用内建 fetch 实现。
 */

export interface HttpRequestConfig {
  url: string;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  data?: any;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** SSE 流式回调 */
  onChunk?: (chunk: string) => void;
  /** 静默模式（探测请求跳过错误提示） */
  silent?: boolean;
  /** 是否为 SSE 流式请求 */
  stream?: boolean;
}

export interface HttpResponse<T = any> {
  code: string;
  data: T;
  message?: string;
}

export interface HttpAdapter {
  request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
}
