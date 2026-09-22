<script lang="ts" setup>
import { maybeStartTour, tourState, TOUR_STEPS, markTourDone } from './composables/use-tour';
import { createIconifyIcon } from './providers/icons';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type { AIModuleType } from './types';

import ModuleNav from './components/module-nav.vue';
import TenantSwitcher from './components/tenant-switcher.vue';
import AgentCompact from './modules/agent-compact.vue';
import ChatWorkbench from './modules/chat/index.vue';
import KnowledgeCompact from './modules/knowledge-compact.vue';
import McpCompact from './modules/mcp-compact.vue';
import Nl2sqlAuditCompact from './modules/nl2sql-audit-compact.vue';
import PerceptionCenter from './modules/perception-center.vue';
import ProviderCompact from './modules/provider-compact.vue';
import SettingsCompact from './modules/settings-compact.vue';
import ScheduleCompact from './modules/schedule-compact.vue';
import SkillCompact from './modules/skill-compact.vue';

import {
  checkBackendHealth,
  useBackendHealth,
} from './composables/use-backend-health';

defineOptions({ name: 'AiAssistantContent' });

const active = ref<AIModuleType>('chat');
const chatWorkbenchRef = ref<InstanceType<typeof ChatWorkbench> | null>(null);

const health = useBackendHealth();

const WarningIcon = createIconifyIcon('lucide:triangle-alert');
const SettingsIcon = createIconifyIcon('lucide:settings');
const RefreshIcon = createIconifyIcon('lucide:refresh-cw');

/** 离线提示文案（按 reason 分类） */
const disconnectReasonText = computed(() => {
  if (health.value.state !== 'disconnected') return '';
  const reason = health.value.reason;
  if (reason === 'network') return '无法连接到后端服务';
  if (reason === 'timeout') return '后端服务响应超时';
  if (reason === 'http') return '后端服务返回错误';
  return '后端服务不可达';
});

/**
 * 抽屉打开时自动检测：
 * - 首次挂载（state === 'idle'）必检
 * - 之后每 30s TTL 内复用缓存
 * - 检测中显示「检测中…」
 */
onMounted(() => {
  if (health.value.state === 'idle') {
    void checkBackendHealth();
  }
});

/**
 * 监听 baseURL 变化（用户在设置页保存后）：
 * - 通过自定义事件 'ai-base-url-changed' 通知失效缓存并重检
 */
if (typeof window !== 'undefined') {
  window.addEventListener('ai-base-url-changed', () => {
    void checkBackendHealth(true);
  });
}

async function goToSettings() {
  active.value = 'settings';
  await nextTick();
  // 等 settings 模块挂载后再滚动到后端服务区块
  await nextTick();
  const el = document.querySelector('[data-ai-anchor="backend-service"]');
  if (el && 'scrollIntoView' in el) {
    (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function manualRetry() {
  await checkBackendHealth(true);
}

/** Agents 管理 → 测试对话：切换到 chat 模块并使用指定 Agent 开始对话 */
async function handleStartChat(agentId: string) {
  active.value = 'chat';
  // 等待 ChatWorkbench 渲染完成后再调用
  await nextTick();
  await nextTick();
  chatWorkbenchRef.value?.startChatWithAgent(agentId);
}

// 当健康状态变化为 disconnected 时，如果用户当前在 chat 也保持在 chat（让 banner 提示）
watch(
  () => health.value.state,
  () => {
    // 仅用于触发依赖刷新，不做副作用
  },
);

// T19：首次打开抽屉触发新手引导（延迟等待模块渲染）
watch(
  () => health?.value?.state,
  (v) => {
    if (v === 'connected' || v === 'disconnected') {
      setTimeout(() => maybeStartTour(), 1500);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 离线横幅：仅在 disconnected 状态展示 -->
    <div
      v-if="health.state === 'disconnected'"
      class="flex flex-shrink-0 items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[12px] text-red-600 dark:text-red-400"
    >
      <component :is="WarningIcon" class="h-3.5 w-3.5 flex-shrink-0" />
      <span class="font-medium">AI 后端未连通</span>
      <span class="opacity-70">·</span>
      <span class="truncate">{{ disconnectReasonText }}，请在设置中配置服务地址</span>
      <div class="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          class="flex h-6 items-center gap-1 rounded border border-red-500/40 px-1.5 hover:bg-red-500/10"
          title="重新检测"
          @click="manualRetry"
        >
          <component :is="RefreshIcon" class="h-3 w-3" />
          重检
        </button>
        <button
          type="button"
          class="flex h-6 items-center gap-1 rounded bg-red-500 px-2 font-medium text-white hover:bg-red-500/90"
          @click="goToSettings"
        >
          <component :is="SettingsIcon" class="h-3 w-3" />
          去设置
        </button>
      </div>
    </div>
    <!-- 检测中：轻量横条，避免一打开抽屉就闪一下 -->
    <div
      v-else-if="health.state === 'checking' || health.state === 'idle'"
      class="flex flex-shrink-0 items-center gap-2 border-b border-border bg-background-deep px-3 py-1 text-[11px] text-muted-foreground"
    >
      <span class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      <span>{{ health.state === 'idle' ? '等待检测后端…' : '正在检测后端…' }}</span>
    </div>

    <!-- 多租户切换条：仅 pro 注入 TenantExtension 时显示（单租户基座不渲染） -->
    <TenantSwitcher />

    <div class="flex min-h-0 flex-1">
      <ModuleNav v-model:active="active" />
      <div class="flex min-w-0 flex-1 flex-col">
        <ChatWorkbench
          v-if="active === 'chat'"
          ref="chatWorkbenchRef"
          @go-settings="goToSettings"
        />
        <SkillCompact v-else-if="active === 'skill'" />
        <ScheduleCompact v-else-if="active === 'schedule'" />
        <AgentCompact
          v-else-if="active === 'agent'"
          @start-chat="handleStartChat"
        />
        <McpCompact v-else-if="active === 'mcp'" />
        <KnowledgeCompact v-else-if="active === 'knowledge'" />
        <ProviderCompact v-else-if="active === 'provider'" />
        <Nl2sqlAuditCompact v-else-if="active === 'audit'" />
        <PerceptionCenter v-else-if="active === 'perception'" />
        <SettingsCompact v-else-if="active === 'settings'" />
      </div>
    </div>
  </div>

  <!-- T19：新手引导浮层（任务门控式） -->
  <div
    v-if="tourState.active && tourState.step < TOUR_STEPS.length"
    class="fixed bottom-16 left-1/2 z-[3000] w-[300px] -translate-x-1/2 rounded-xl border border-border bg-card p-3 shadow-lg"
  >
    <div class="mb-1 flex items-center justify-between">
      <span class="text-[12px] font-medium">
        {{ TOUR_STEPS[tourState.step].title }}（{{ tourState.step + 1 }}/{{ TOUR_STEPS.length }}）
      </span>
      <button class="text-[10px] text-muted-foreground hover:text-foreground" @click="markTourDone()">
        跳过
      </button>
    </div>
    <p class="text-[11px] leading-4 text-muted-foreground">
      {{ TOUR_STEPS[tourState.step].description }}
    </p>
    <div class="mt-2 flex gap-1">
      <span
        v-for="st in TOUR_STEPS"
        :key="st.id"
        class="h-1 flex-1 rounded"
        :class="st.id <= tourState.step ? 'bg-primary' : 'bg-muted'"
      />
    </div>
  </div>
</template>