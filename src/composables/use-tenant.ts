/**
 * 多租户切换 composable
 *
 * 只消费 AiAssistantConfig.tenant（由闭源包注入）：
 * - enabled=false/缺省 → 单租户多用户基座，不加载任何租户数据；
 * - 切换动作只调用 TenantExtension.switchTenant（服务端可信接口 POST /tenants/switch），
 *   成功后把服务端重签 token 交给 auth.onAuthRefresh 持久化；
 * - 宿主未提供 onAuthRefresh 时显式提示"凭证未更新"，不得静默显示切换成功。
 */
import { computed, ref, watch } from 'vue';

import { useAiAssistantConfig } from '../providers/inject';
import type { TenantInfo } from '../providers/tenant-provider';

export interface UseTenantReturn {
  enabled: Readonly<import('vue').ComputedRef<boolean>>;
  current: Readonly<import('vue').Ref<TenantInfo | null>>;
  tenants: Readonly<import('vue').Ref<TenantInfo[]>>;
  switching: Readonly<import('vue').Ref<boolean>>;
  error: Readonly<import('vue').Ref<string>>;
  refresh(): Promise<void>;
  switchTo(tenantId: string): Promise<void>;
}

export function useTenant(): UseTenantReturn {
  const config = useAiAssistantConfig();
  const ext = config.tenant;

  const enabled = computed(() => Boolean(ext?.enabled));
  const current = ref<TenantInfo | null>(null);
  const tenants = ref<TenantInfo[]>([]);
  const switching = ref(false);
  const error = ref('');

  async function refresh(): Promise<void> {
    if (!ext?.enabled) return;
    error.value = '';
    try {
      if (ext.getCurrentTenant) {
        current.value = await ext.getCurrentTenant();
      }
      if (ext.listTenants) {
        tenants.value = await ext.listTenants();
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '租户信息加载失败';
    }
  }

  async function switchTo(tenantId: string): Promise<void> {
    if (!ext?.switchTenant) {
      error.value = '当前环境不支持租户切换';
      return;
    }
    switching.value = true;
    error.value = '';
    try {
      const result = await ext.switchTenant(tenantId);
      const auth = config.auth;
      let pendingError = '';
      if (auth?.onAuthRefresh) {
        await auth.onAuthRefresh(result);
      } else if (!result.accessToken && !result.refreshToken) {
        pendingError = '切换成功但服务端未返回新凭证';
      } else {
        pendingError = '切换成功但凭证未更新（宿主未提供 onAuthRefresh），请刷新页面';
      }
      // refresh() 会重置 error，错误提示须在刷新后写入
      await refresh();
      if (pendingError) {
        error.value = pendingError;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '租户切换失败';
    } finally {
      switching.value = false;
    }
  }

  watch(
    enabled,
    (v) => {
      if (v) void refresh();
    },
    { immediate: true },
  );

  return { enabled, current, tenants, switching, error, refresh, switchTo };
}
