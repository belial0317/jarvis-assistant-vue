/**
 * 鉴权提供者抽象
 *
 * AI 助手无独立登录体系，由宿主注入 token 获取逻辑。
 */

export interface AuthProvider {
  /** 返回当前 accessToken，用于注入 Authorization 头 */
  getToken(): string | null | undefined;

  /**
   * 可选：返回 X-Tenant-Id 头的值。
   * 服务端对已认证请求以 JWT/API Key 内的租户为准并覆盖此头，
   * 因此多数宿主无需提供；仅为未认证的开放端点或展示目的保留。
   */
  getTenantId?(): number | string | null | undefined;
}
