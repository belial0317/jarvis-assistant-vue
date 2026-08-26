<script lang="ts" setup>
import { createIconifyIcon } from './providers/icons';
import type { AiAssistantConfig } from './providers/config';
import { AI_ASSISTANT_CONFIG_KEY, useAiAssistantConfig } from './providers/inject';
import { Drawer as ADrawer, Tooltip as ATooltip } from 'ant-design-vue';

import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';

import AiAssistantContent from './content.vue';

import {
  checkBackendHealth,
  useBackendHealth,
} from './composables/use-backend-health';

import { pagePerception } from './perception/manager';

defineOptions({ name: 'AiAssistant' });

/**
 * 抽屉根容器的额外 class
 *
 * 用法：
 *   <AiAssistant root-class-name="ai-theme-light" />
 *
 * 在 CSS 中可以这样覆盖主题：
 *   .ai-theme-light .ant-drawer-content { ... }
 *   .ai-theme-light .bg-background { ... }
 */
const props = withDefaults(
  defineProps<{
    rootClassName?: string;
    /**
     * 可选的配置对象。
     * 优先级高于 createAiAssistant(config) 注入的全局配置：
     * - prop 提供时，prop 覆盖全局（同一渲染周期内组件局部的 override）
     * - prop 缺省时降级到全局注入的配置（来自 useAiAssistantConfig）
     */
    config?: AiAssistantConfig;
  }>(),
  { rootClassName: '' },
);

// 解析有效配置：优先使用 prop 传入的配置，否则使用全局注入的配置
let resolvedConfig: AiAssistantConfig;
if (props.config) {
  resolvedConfig = props.config;
} else {
  try {
    resolvedConfig = useAiAssistantConfig();
  } catch {
    resolvedConfig = {} as AiAssistantConfig;
  }
}
provide(AI_ASSISTANT_CONFIG_KEY, resolvedConfig);

const SparklesIcon = createIconifyIcon('lucide:sparkles');
const XIcon = createIconifyIcon('lucide:x');

const open = ref(false);
const health = useBackendHealth();

/** 合并：默认 + 外部传入的 rootClassName */
const drawerRootClass = computed(() =>
  ['ai-assistant-drawer', props.rootClassName].filter(Boolean).join(' '),
);

/** 后端未连通时入口按钮显示红点（除 checking/idle 的中间态外都标记） */
const showOfflineDot = computed(
  () => health.value.state === 'disconnected',
);

function toggle() {
  open.value = !open.value;
}

/**
 * 抽屉从关闭变打开：触发一次健康检查（如果 30s TTL 内已检查过则直接复用）
 * 这样设计的好处：抽屉关闭期间后端如果被关闭，下次打开会立即感知
 */
watch(open, (isOpen) => {
  if (isOpen) {
    void checkBackendHealth();
  }
  // 感知管线联动：抽屉关闭暂停 DOM 观察（省 CPU），打开恢复并重采集
  pagePerception.setActive(isOpen);
});

// ===== PP2 感知管线挂接：路由监听 + 可见性门控 =====
// 挂载即启动（与抽屉开关无关：页面感知服务于会话上下文，抽屉仅门控观察）
onMounted(() => {
  pagePerception.start(resolvedConfig.route, resolvedConfig.mainContentSelector);
});

onBeforeUnmount(() => {
  void pagePerception.stop();
});

// PP4 后端健康联动：断连 → 感知会话 degraded（暂停远程依赖，本地 DOM 统计
// 仍可用）；恢复 → 自动重采集。中间态（checking/idle）不干预。
watch(
  () => health.value.state,
  (state) => {
    if (state === 'disconnected') {
      pagePerception.setDegraded(true);
    } else if (state === 'connected') {
      pagePerception.setDegraded(false);
    }
  },
);

defineExpose({ toggle, open });
</script>

<template>
  <a-tooltip placement="bottom" :mouse-enter-delay="0.4">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
      :class="
        open
          ? 'bg-primary/10 text-primary'
          : 'text-foreground hover:bg-accent'
      "
      aria-label="AI 助手"
      @click="toggle"
    >
      <component :is="SparklesIcon" class="h-[18px] w-[18px]" />
    </button>
    <template #title>
      <span>{{ showOfflineDot ? 'AI 助手 · 后端未连通' : 'AI 助手' }}</span>
    </template>
  </a-tooltip>

  <a-drawer
    v-model:open="open"
    placement="right"
    :width="560"
    :body-style="{ padding: '0', display: 'flex', flexDirection: 'column' }"
    :header-style="{ display: 'none' }"
    :mask="false"
    :mask-closable="false"
    :closable="false"
    :root-class-name="drawerRootClass"
  >
    <div class="flex h-full flex-col bg-background">
      <div
        class="flex h-[42px] flex-shrink-0 items-center justify-between border-b border-border px-3"
      >
        <div class="flex items-center gap-2">
          <div
            class="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-medium text-primary-foreground"
          >
            <component :is="SparklesIcon" class="h-3.5 w-3.5" />
          </div>
          <span class="text-[13px] font-medium">AI 助手</span>
        </div>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="关闭"
          @click="open = false"
        >
          <component :is="XIcon" class="h-4 w-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1">
        <AiAssistantContent />
      </div>
    </div>
  </a-drawer>
</template>

<style>
.ai-assistant-drawer .ant-drawer-content {
  border-left: 1px solid hsl(var(--border));
  border-radius: 0;
}
</style>