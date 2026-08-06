/**
 * 依赖注入机制
 *
 * 通过 Vue 的 provide/inject + 插件模式，
 * 将 AiAssistantConfig 注入到所有子组件。
 *
 * 同时维护全局引用，使 API 层等非组件上下文也能获取配置。
 */

import type { App, InjectionKey } from 'vue';

import { inject } from 'vue';

import type { AiAssistantConfig } from './config';

export const AI_ASSISTANT_CONFIG_KEY: InjectionKey<AiAssistantConfig> =
  Symbol('ai-assistant-config');

/**
 * 全局配置引用（支持在非组件上下文中使用，如 API 层）。
 *
 * createAiAssistant 安装插件时会同步写入此变量，
 * useAiAssistantConfig 在 inject 失败时降级读取它。
 */
let globalConfig: AiAssistantConfig | null = null;

/**
 * Vue 插件：全局注入配置
 *
 * @example
 * app.use(createAiAssistant({
 *   baseURL: '/ai-api',
 *   auth: { getToken: () => store.accessToken },
 * }));
 */
export function createAiAssistant(config: AiAssistantConfig) {
  globalConfig = config;
  return {
    install(app: App) {
      app.provide(AI_ASSISTANT_CONFIG_KEY, config);
    },
  };
}

/**
 * 获取配置
 *
 * 优先使用 Vue inject（组件 setup 上下文内），
 * 降级到全局引用（API 层等非组件上下文，包括 watch 回调、事件处理函数等）。
 *
 * @throws 若未通过 createAiAssistant 注入或 prop 传入
 */
export function useAiAssistantConfig(): AiAssistantConfig {
  // 必须在 setup 顶层或 functional 组件中调用，否则 inject 会抛错
  // 此时降级到全局引用
  try {
    const config = inject(AI_ASSISTANT_CONFIG_KEY);
    if (config) return config;
  } catch {
    /* inject() outside setup - fall through to globalConfig */
  }
  if (globalConfig) return globalConfig;
  throw new Error(
    '[AiAssistant] 请先通过 createAiAssistant(config) 安装插件，' +
    '或通过 <AiAssistant :config="..." /> 传入配置',
  );
}
