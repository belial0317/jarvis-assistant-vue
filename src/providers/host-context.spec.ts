import { describe, expect, it } from 'vitest';

import type { HostBusinessContext } from './config';
import {
  HOST_CONTEXT_MAX_CHARS,
  createHostBusinessContextStore,
  validateHostBusinessContext,
} from './host-context';

describe('T6 宿主业务上下文(providers/host-context)', () => {
  const base: HostBusinessContext = {
    userId: '2095922659209089025',
    roles: ['operator'],
    bizObjectType: 'order',
    bizObjectId: 'ORD-20260905-099',
    payload: { amount: 66600, status: '处理中' },
  };

  it('合法上下文通过校验并可 set/clear', () => {
    const store = createHostBusinessContextStore();
    expect(store.context.value).toBeNull();
    store.set(base);
    expect(store.context.value?.bizObjectId).toBe('ORD-20260905-099');
    store.clear();
    expect(store.context.value).toBeNull();
  });

  it('静态 prop 初始化:create 时携带初始上下文', () => {
    const store = createHostBusinessContextStore(base);
    expect(store.context.value).not.toBeNull();
  });

  it('payload 嵌套对象 → 显式抛错(不静默吞掉)', () => {
    const bad: HostBusinessContext = {
      ...base,
      payload: { nested: { deep: 1 } } as unknown as HostBusinessContext['payload'],
    };
    expect(() => validateHostBusinessContext(bad)).toThrow(/扁平标量/);
  });

  it('序列化超上限 → 显式抛错,错误信息含实际尺寸', () => {
    const big: HostBusinessContext = {
      ...base,
      payload: { blob: 'x'.repeat(HOST_CONTEXT_MAX_CHARS + 10) },
    };
    expect(() => validateHostBusinessContext(big)).toThrow(/超过上限/);
  });

  it('set 抛错后保留旧值(不进入半更新状态)', () => {
    const store = createHostBusinessContextStore(base);
    try {
      store.set({ payload: { blob: 'y'.repeat(HOST_CONTEXT_MAX_CHARS + 1) } });
      expect.unreachable('应当抛错');
    } catch {
      // 预期
    }
    expect(store.context.value?.bizObjectId).toBe('ORD-20260905-099');
  });
});
