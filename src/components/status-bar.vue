<script lang="ts" setup>
import { computed } from 'vue';

import { useBackendHealth } from '../composables/use-backend-health';

defineOptions({ name: 'AiStatusBar' });

const props = withDefaults(
  defineProps<{
    connected?: boolean;
    mode?: string;
    modelName?: string;
    tokens?: number;
    cost?: number;
    mcpReady?: number;
    mcpTotal?: number;
  }>(),
  {
    connected: true,
    mode: 'Agent',
    modelName: '',
    tokens: 0,
    cost: 0,
    mcpReady: 0,
    mcpTotal: 0,
  },
);

const health = useBackendHealth();

/**
 * 连接状态 = 业务连通 + 真实 health state
 * - prop.connected 保留向后兼容，默认 true（如果父组件不传）
 * - 后端断开时强制显示为「离线」
 */
const effectiveConnected = computed(
  () => props.connected && health.value.state === 'connected',
);

/** 状态文案 */
const statusText = computed(() => {
  if (health.value.state === 'connected') return '已连接';
  if (health.value.state === 'checking' || health.value.state === 'idle') {
    return '检测中…';
  }
  return '离线';
});

/** 圆点颜色 */
const dotClass = computed(() => {
  if (health.value.state === 'connected') return 'bg-emerald-500';
  if (health.value.state === 'disconnected') return 'bg-red-500';
  return 'bg-amber-500 animate-pulse';
});
</script>

<template>
  <footer
    class="flex h-[26px] flex-shrink-0 items-center gap-2 border-t border-border bg-background-deep px-3 text-[11px] text-muted-foreground"
  >
    <span class="flex items-center gap-1">
      <span
        class="h-1.5 w-1.5 rounded-full"
        :class="dotClass"
      />
      {{ statusText }}
    </span>
    <span class="opacity-40">·</span>
    <span>{{ mode }} 模式</span>
    <template v-if="modelName">
      <span class="opacity-40">·</span>
      <span class="max-w-[140px] truncate font-medium text-foreground">{{ modelName }}</span>
    </template>
    <span class="ml-auto flex items-center gap-2">
      <span>{{ tokens.toLocaleString() }} tokens</span>
      <span v-if="cost > 0" class="opacity-40">·</span>
      <span v-if="cost > 0">${{ cost.toFixed(2) }}</span>
      <template v-if="mcpTotal > 0">
        <span class="opacity-40">·</span>
        <span :class="mcpReady < mcpTotal ? 'text-amber-500' : ''">MCP {{ mcpReady }}/{{ mcpTotal }}</span>
      </template>
    </span>
  </footer>
</template>