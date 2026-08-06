/**
 * 鉴权提供者抽象
 *
 * AI 助手无独立登录体系，由宿主注入 token 获取逻辑。
 */

export interface AuthProvider {
  /** 返回当前 accessToken，用于注入 Authorization 头 */
  getToken(): string | null | undefined;
}
