<script lang="ts" setup>
/**
 * 租户切换条：仅在 AiAssistantConfig.tenant.enabled（pro 注入）时渲染。
 * 切换动作走服务端可信接口（TenantExtension.switchTenant），
 * 成功后由 useTenant 触发 auth.onAuthRefresh 持久化新凭证。
 */
import { useTenant } from '../composables/use-tenant';

defineOptions({ name: 'AiTenantSwitcher' });

const { enabled, current, tenants, switching, error, switchTo } = useTenant();

function onChange(value: string) {
  if (value && value !== current.value?.id) {
    void switchTo(value);
  }
}
</script>

<template>
  <div
    v-if="enabled"
    class="flex flex-shrink-0 items-center gap-2 border-b border-border bg-background-deep px-3 py-1.5 text-[12px]"
    data-ai-tenant-switcher
  >
    <span class="text-muted-foreground">当前租户</span>
    <a-select
      :value="current?.id"
      :loading="switching"
      size="small"
      class="min-w-[160px]"
      data-ai-tenant-select
      @change="onChange"
    >
      <a-select-option v-for="t in tenants" :key="t.id" :value="t.id">
        {{ t.name }}{{ t.code ? `（${t.code}）` : '' }}
      </a-select-option>
    </a-select>
    <span v-if="error" class="text-amber-600 dark:text-amber-400">{{ error }}</span>
  </div>
</template>
