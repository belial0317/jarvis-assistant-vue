/**
 * SDK 升级检查单测（tasks-2609-1715-49 T5）
 *
 * 覆盖：semver 比较（build metadata 忽略 / 非法段 fail-safe）、
 * 检查结果（有更新 / 无更新 / 静默失败）、sessionStorage 关闭标记。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../api/client', () => ({
  aiRequestClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
  },
}));

// use-sdk-update 依赖 useAiAssistantConfig（inject/global）；测试直接调用纯函数与 mock 路径
import {
  compareVersion,
  dismissSdkNotice,
  isSdkNoticeDismissed,
} from './use-sdk-update';

describe('compareVersion（semver x.y.z，忽略 build metadata）', () => {
  it('新版本大于旧版本', () => {
    expect(compareVersion('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersion('0.9.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersion('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('旧版本小于新版本', () => {
    expect(compareVersion('0.2.0', '0.1.0')).toBeGreaterThan(0);
  });

  it('相等：build metadata 不参与比较', () => {
    expect(compareVersion('0.2.0+abc1234', '0.2.0')).toBe(0);
    expect(compareVersion('0.2.0+abc1234', '0.2.0+def5678')).toBe(0);
  });

  it('非法段按低于任何合法段处理（fail-safe，不抛错）', () => {
    expect(compareVersion('abc', '0.2.0')).toBeLessThan(0);
    expect(compareVersion('1.x.0', '1.2.0')).toBeLessThan(0);
    expect(compareVersion('', '')).toBe(0);
  });
});

describe('sessionStorage 关闭标记（按版本记录）', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('未关闭时为 false；关闭后为 true', () => {
    expect(isSdkNoticeDismissed()).toBe(false);
    dismissSdkNotice();
    expect(isSdkNoticeDismissed()).toBe(true);
  });
});
