/**
 * 路由上下文提供者抽象
 *
 * AI 助手的"页面感知"功能需要读取当前路由信息（path/title/name），
 * 但不依赖特定路由库（vue-router / 其他）。
 * 宿主注入此 provider 即可启用页面感知。
 */

export interface RouteContext {
  path: string;
  title?: string;
  name?: string;
  meta?: Record<string, any>;
}

export interface RouteContextProvider {
  /** 获取当前路由上下文 */
  getRoute(): RouteContext;
  /** 监听路由变化，返回取消监听函数 */
  watchRoute(callback: (route: RouteContext) => void): () => void;
}
