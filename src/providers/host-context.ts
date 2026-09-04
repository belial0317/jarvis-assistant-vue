/**
 * T6 宿主业务上下文(Host Business Context)存储。
 *
 * 权威感知源:宿主把「当前用户/业务对象」等业务事实显式注入组件,
 * 后端注入【宿主业务上下文】块并声明优先于 DOM 页面内容。
 * 与 DOM 自动感知的边界:注入 = 宿主权威声明;抓取 = 尽力理解,两者分块不混用。
 */

import { ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

import type { HostBusinessContext } from './config';

/** 序列化总量上限(字符):超限显式拒绝,不静默截断(§0.5 第 5 条) */
export const HOST_CONTEXT_MAX_CHARS = 2000;

export interface HostBusinessContextStore {
  /** 当前生效的宿主上下文(null = 宿主未注入,不伪造默认值) */
  readonly context: Ref<HostBusinessContext | null>;
  /** 动态覆盖(业务对象随路由切换时调用);校验失败显式抛错 */
  set: (ctx: HostBusinessContext) => void;
  /** 清除(宿主离开业务页面等场景) */
  clear: () => void;
}

export const AI_ASSISTANT_HOST_CONTEXT_KEY: InjectionKey<HostBusinessContextStore> =
  Symbol('ai-assistant-host-context');

/** 结构校验:payload 仅扁平标量;序列化总量不超上限 */
export function validateHostBusinessContext(ctx: HostBusinessContext): void {
  if (ctx.payload) {
    for (const [key, value] of Object.entries(ctx.payload)) {
      if (value !== null && typeof value === 'object') {
        throw new Error(
          `[hostContext] payload.${key} 必须为扁平标量(string/number/boolean),禁止嵌套对象`,
        );
      }
    }
  }
  const size = JSON.stringify(ctx).length;
  if (size > HOST_CONTEXT_MAX_CHARS) {
    throw new Error(
      `[hostContext] 序列化后 ${size} 字符,超过上限 ${HOST_CONTEXT_MAX_CHARS},请精简 payload`,
    );
  }
}

export function createHostBusinessContextStore(
  initial?: HostBusinessContext,
): HostBusinessContextStore {
  const context = ref<HostBusinessContext | null>(initial ?? null);
  const set = (ctx: HostBusinessContext): void => {
    validateHostBusinessContext(ctx);
    context.value = ctx;
  };
  const clear = (): void => {
    context.value = null;
  };
  return { context, set, clear };
}
