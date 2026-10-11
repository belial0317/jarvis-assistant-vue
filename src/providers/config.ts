/**
 * AI 助手总配置接口
 *
 * 宿主项目通过 createAiAssistant(config) 注入配置，
 * 或通过 <AiAssistant :config="..." /> 组件 prop 传入。
 */

import type { AuthProvider } from './auth-provider';
import type { HttpAdapter } from './http-adapter';
import type { LocaleProvider } from './locale-provider';
import type { RouteContextProvider } from './route-provider';
import type { TenantExtension } from './tenant-provider';

/**
 * T6 宿主业务上下文（权威感知源）。
 * 宿主在路由/业务对象切换时通过 config.businessContext 静态注入，
 * 或调用实例方法 setBusinessContext()/clearBusinessContext() 动态更新。
 * 后端注入【宿主业务上下文】块，优先级高于 DOM 页面内容。
 * 约束：payload 仅扁平标量，序列化后总量不超过 2000 字符（超限注入时显式拒绝）。
 */
export interface HostBusinessContext {
  /** 当前用户标识（宿主体系内的用户 ID） */
  userId?: string;
  /** 当前用户角色列表 */
  roles?: string[];
  /** 正在查看的业务对象类型（如 'order' / 'gateway-provider'） */
  bizObjectType?: string;
  /** 业务对象 ID */
  bizObjectId?: string;
  /** 业务关键数据（扁平标量键值，禁嵌套对象/数组） */
  payload?: Record<string, string | number | boolean>;
  /** 签名（JWT/HMAC，可选增强：防客户端伪造，本期仅预留传输位） */
  signature?: string;
  /** 宿主生成时间（Unix 毫秒，用于后端判断新鲜度） */
  fetchedAt?: number;
}

export interface AiAssistantConfig {
  /**
   * AI 后端基础地址。
   * 开发环境通常通过 vite proxy 转发，生产环境为网关地址。
   * @default '/ai-api'
   */
  baseURL?: string;

  /**
   * 鉴权提供者：返回当前用户的 Bearer token。
   * 宿主需注入此函数，AI 助手无独立登录体系。
   */
  auth?: AuthProvider;

  /**
   * 多租户扩展（由闭源包 @jarvis/frontend-pro 注入）。
   * 缺省/未提供 = 单租户多用户基座；enabled=true 时组件渲染租户切换入口。
   */
  tenant?: TenantExtension;

  /**
   * HTTP 适配器：若宿主已有 RequestClient/fetch 封装，可注入复用。
   * 不提供时使用内建 fetch 实现。
   */
  http?: HttpAdapter;

  /**
   * 国际化提供者：返回当前语言代码。
   * 不提供时默认 'zh-CN'。
   */
  locale?: LocaleProvider;

  /**
   * 路由上下文提供者：返回当前路由信息，用于页面感知。
   * 不提供时页面感知功能降级（仅传空上下文）。
   */
  route?: RouteContextProvider;

  /**
   * T6 宿主业务上下文（静态注入形态）。
   * 动态场景（业务对象随路由切换）建议用实例方法 setBusinessContext() 覆盖。
   * 权威感知源：后端注入【宿主业务上下文】并声明优先于 DOM 页面内容。
   */
  businessContext?: HostBusinessContext;

  /**
   * 页面感知行为配置(S5/T4)。
   * defaultEnabled:感知总开关默认值(用户可在会话工具栏临时切换,
   * 偏好持久化于 localStorage,宿主配置仅决定缺省)。敏感宿主可配 false。
   */
  perception?: {
    defaultEnabled?: boolean;
  };

  /**
   * 会话历史可见性（2026-10-11 会话隔离）：false 时不加载/展示历史会话列表，
   * 每次进入直接开新会话（匿名访客体验场景，防止看到其他用户会话）。
   * @default true
   */
  sessionHistoryVisible?: boolean;

  /**
   * 主内容区 DOM 选择器，页面感知提取用。
   * @default '#__vben_main_content'
   */
  mainContentSelector?: string;

  /**
   * 错误通知回调。不提供时使用 ant-design-vue message.error。
   */
  onError?: (message: string) => void;

  /**
   * 插件市场配置。
   * catalogURL：门户运营平台的插件目录 API 地址（跨系统只读）。
   * 不提供或不可达时，市场模块降级为"仅显示已安装插件"。
   */
  market?: {
    catalogURL?: string;
  };

  /**
   * 设置模块字段管控（宿主/门户管理端下发）。
   * - serviceUrlVisible=false：设置模块隐藏「服务地址」字段（不可查看/编辑）；
   * - apiKeyVisible=false：设置模块隐藏「API Key」字段。
   * 缺省均可见可编辑。管理员锁定的字段以宿主注入的配置为唯一来源。
   */
  settings?: {
    serviceUrlVisible?: boolean;
    apiKeyVisible?: boolean;
  };

  /**
   * 控制台下发的模型列表（门户系统参数 component.models）。
   * 配置后组件会话模型下拉以该列表为准（值为模型名，openai-compatible 直传）；
   * 为空时回落供应商模型目录。
   */
  models?: string[];

  /**
   * SDK 升级提醒配置（tasks-2609-1715-49 T3，全可选向后兼容）。
   * 数据源默认后端 /api-token/sdk-version；不提供时按构建期常量渠道检查。
   */
  sdk?: {
    /** 渠道覆盖（默认取构建期 __SDK_CHANNEL__） */
    channel?: 'oss' | 'commercial';
    /** 升级检查端点覆盖（默认 /api-token/sdk-version） */
    checkUrl?: string;
    /** 变更日志地址覆盖（默认取服务端返回的 changelogUrl） */
    changelogUrl?: string;
    /** true=完全关闭升级提醒（检查与 UI 均不触发） */
    disableCheck?: boolean;
  };

  /**
   * 宿主/门户下发的参数同步：组件挂载时写入设置存储（管理端配置为源）。
   * - baseURL → 设置项「服务地址」（ai_assistant_base_url）
   * - apiKey → 设置项「API Key」（ai_assistant_api_key）
   * - defaultModel → 设置项「默认模型」
   * 值为空时跳过对应项（不清空用户本地已有值）。
   */
  syncParams?: {
    baseURL?: string;
    apiKey?: string;
    defaultModel?: string;
  };
}
