/**
 * 多租户扩展契约（开源主库）
 *
 * 安全边界（重要）：
 * - 已认证请求的租户由服务端 JWT/API Key 内的租户决定，客户端 X-Tenant-Id 头
 *   会被服务端认证过滤器覆盖，因此【不能】通过修改请求头实现租户切换；
 * - 多租户切换必须调用服务端可信切换接口（pro：POST /tenants/switch），
 *   切换成功后由服务端重签 JWT，扩展通过 onAuthRefresh 回写新 token；
 * - 本契约仅用于租户状态展示、切换动作触发，不承载安全事实。
 *
 * 实现由闭源包 @jarvis/frontend-pro 提供（createProTenantExtension）；
 * 开源基座不安装时保持单租户多用户行为。
 */

/** 租户信息（服务端返回的可信展示数据） */
export interface TenantInfo {
  /** 租户ID（字符串避免雪花ID精度丢失） */
  id: string;
  /** 租户名称 */
  name: string;
  /** 租户编码 */
  code?: string;
  /** 状态：active/suspended/canceled */
  status?: string;
}

/** token/上下文刷新结果（服务端重签后回写宿主） */
export interface AuthRefreshResult {
  accessToken?: string;
  refreshToken?: string;
}

/**
 * 多租户扩展实现（由闭源 pro 包提供；开源基座不安装时保持单租户多用户行为）。
 * per-instance config 注入，不引入全局插件总线。
 */
export interface TenantExtension {
  /** true=宿主已启用多租户（pro）；false/缺省=单租户多用户基座 */
  enabled: boolean;

  /** 当前可信租户（来自服务端 /tenants/current） */
  getCurrentTenant?(): Promise<TenantInfo | null>;

  /** 当前用户可切换租户列表（服务端 /tenants/my） */
  listTenants?(): Promise<TenantInfo[]>;

  /**
   * 可信租户切换：调用服务端 POST /tenants/switch?tenantId=...
   * 成功后返回服务端重签的 token；调用方必须把结果交给 onAuthRefresh。
   */
  switchTenant?(tenantId: string): Promise<AuthRefreshResult>;
}
