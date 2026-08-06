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
   * 主内容区 DOM 选择器，页面感知提取用。
   * @default '#__vben_main_content'
   */
  mainContentSelector?: string;

  /**
   * 错误通知回调。不提供时使用 ant-design-vue message.error。
   */
  onError?: (message: string) => void;
}
