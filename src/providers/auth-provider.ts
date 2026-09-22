/**
 * 鉴权提供者抽象
 *
 * AI 助手无独立登录体系，由宿主注入 token 获取逻辑。
 */

import type { AuthRefreshResult } from './tenant-provider';

export interface AuthProvider {
  /** 返回当前 accessToken，用于注入 Authorization 头 */
  getToken(): string | null | undefined;

  /**
   * 可选：返回 X-Tenant-Id 头的值。
   * 服务端对已认证请求以 JWT/API Key 内的租户为准并覆盖此头，
   * 因此多数宿主无需提供；仅为未认证的开放端点或展示目的保留。
   */
  getTenantId?(): number | string | null | undefined;

  /**
   * 可选：token/上下文刷新回调（多租户可信切换）。
   * 服务端重签 JWT 后由扩展调用；宿主在此持久化新凭证，
   * 使后续请求使用新租户。未提供时切换应显式提示"凭证未更新"。
   */
  onAuthRefresh?(result: AuthRefreshResult): void | Promise<void>;
}
