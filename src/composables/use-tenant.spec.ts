import { describe, expect, it, vi } from 'vitest';

import { useTenant } from './use-tenant';
import { createAiAssistant } from '../providers/inject';
import type { AiAssistantConfig } from '../providers/config';
import type { TenantInfo } from '../providers/tenant-provider';

/**
 * 多租户扩展消费点行为测试：
 * - enabled=false → 不加载租户数据（单租户基座）；
 * - enabled=true → 加载当前租户与列表；
 * - switchTo → 只走可信切换接口，成功后触发 auth.onAuthRefresh；
 * - 宿主未提供 onAuthRefresh → 显式提示凭证未更新。
 */
function install(config: AiAssistantConfig) {
  createAiAssistant(config);
}

describe('useTenant(composables/use-tenant)', () => {
  it('enabled=false：不加载租户数据（单租户多用户基座）', async () => {
    const listTenants = vi.fn();
    install({
      baseURL: '/ai-api',
      auth: { getToken: () => 't' },
      tenant: { enabled: false, listTenants },
    });
    const t = useTenant();
    expect(t.enabled.value).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(listTenants).not.toHaveBeenCalled();
    expect(t.tenants.value).toEqual([]);
  });

  it('enabled=true：加载当前租户与可切换列表', async () => {
    const tenants: TenantInfo[] = [
      { id: '1001', name: '租户A' },
      { id: '1002', name: '租户B' },
    ];
    install({
      baseURL: '/ai-api',
      auth: { getToken: () => 't' },
      tenant: {
        enabled: true,
        getCurrentTenant: async () => tenants[0] ?? null,
        listTenants: async () => tenants,
      },
    });
    const t = useTenant();
    await vi.waitFor(() => expect(t.current.value?.id).toBe('1001'));
    expect(t.tenants.value).toHaveLength(2);
  });

  it('switchTo：调用可信切换接口并触发 onAuthRefresh 持久化', async () => {
    const onAuthRefresh = vi.fn();
    const switchTenant = vi.fn(async (tenantId: string) => {
      expect(tenantId).toBe('1002');
      return { accessToken: 'new-token', refreshToken: 'new-refresh' };
    });
    install({
      baseURL: '/ai-api',
      auth: { getToken: () => 'old-token', onAuthRefresh },
      tenant: { enabled: true, switchTenant },
    });
    const t = useTenant();
    await t.switchTo('1002');
    expect(switchTenant).toHaveBeenCalledWith('1002');
    expect(onAuthRefresh).toHaveBeenCalledWith({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
    });
    expect(t.error.value).toBe('');
  });

  it('宿主未提供 onAuthRefresh：切换后显式提示凭证未更新', async () => {
    install({
      baseURL: '/ai-api',
      auth: { getToken: () => 'old-token' },
      tenant: {
        enabled: true,
        switchTenant: async () => ({ accessToken: 'new-token' }),
      },
    });
    const t = useTenant();
    await t.switchTo('1001');
    expect(t.error.value).toContain('凭证未更新');
  });
});
