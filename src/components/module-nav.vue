<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message, Tooltip as ATooltip } from 'ant-design-vue';

import { computed } from 'vue';

import type { AIModuleMeta, AIModuleType } from '../types';

defineOptions({ name: 'AiModuleNav' });

const props = defineProps<{ active: AIModuleType }>();
const emit = defineEmits<{ 'update:active': [AIModuleType] }>();

const ChatIcon = createIconifyIcon('lucide:message-square');
const SkillIcon = createIconifyIcon('lucide:wand-sparkles');
const AgentIcon = createIconifyIcon('lucide:bot');
const McpIcon = createIconifyIcon('lucide:plug');
const KnowledgeIcon = createIconifyIcon('lucide:book-open');
const ProviderIcon = createIconifyIcon('lucide:server');
const AuditIcon = createIconifyIcon('lucide:scroll-text');
const PerceptionIcon = createIconifyIcon('lucide:radar');
const SettingsIcon = createIconifyIcon('lucide:settings');
const ClockIcon = createIconifyIcon('lucide:clock');

const iconMap: Record<AIModuleType, any> = {
  agent: AgentIcon,
  audit: AuditIcon,
  chat: ChatIcon,
  knowledge: KnowledgeIcon,
  mcp: McpIcon,
  perception: PerceptionIcon,
  provider: ProviderIcon,
  settings: SettingsIcon,
  schedule: ClockIcon,
  skill: SkillIcon,
};

const ALL_MODULES: AIModuleMeta[] = [
  { key: 'chat', label: '会话工作台', icon: '', description: '与 AI 对话', ready: true },
  { key: 'skill', label: 'Skill 管理', icon: '', description: '技能与斜杠命令', ready: true },
  { key: 'agent', label: 'Agents 管理', icon: '', description: '智能体角色', ready: true },
  { key: 'schedule', label: '定时任务', icon: '', description: '周期/定点自动执行', ready: true },
  { key: 'mcp', label: 'MCP 管理', icon: '', description: '模型上下文协议', ready: true },
  { key: 'knowledge', label: '知识库', icon: '', description: '文档与检索', ready: true },
  // 插件市场本期取消（2026-08-27 用户决策，对齐 tasks-2608-2600-23 插件化搁置）；
  // market 模块代码保留为搁置状态，恢复时加回下面一行即可：
  // { key: 'market', label: '插件市场', icon: '', description: '发现与安装第三方插件', ready: true },
  // 感知配置与感知优化合并为「感知中心」（2026-09-04 用户决策，页签容器 perception-center.vue）
  { key: 'perception', label: '感知中心', icon: '', description: '页面感知与优化闭环', ready: true },
  { key: 'provider', label: '供应商管理', icon: '', description: '模型供应商', ready: true },
  { key: 'audit', label: 'NL2SQL 审计', icon: '', description: '查询历史与反馈', ready: true, system: true },
  { key: 'settings', label: '设置', icon: '', description: '偏好与快捷键', ready: true, system: true },
];

const businessModules = computed(() => ALL_MODULES.filter((m) => !m.system));
const systemModules = computed(() => ALL_MODULES.filter((m) => m.system));

function select(m: AIModuleMeta) {
  if (!m.ready) {
    message.info(`「${m.label}」模块建设中，敬请期待`);
    return;
  }
  emit('update:active', m.key);
}

function btnClass(key: AIModuleType) {
  return props.active === key
    ? 'bg-primary/10 text-primary'
    : 'text-muted-foreground hover:bg-accent hover:text-foreground';
}
</script>

<template>
  <nav
    class="relative flex w-12 flex-col items-center gap-1 border-r border-border bg-background-deep py-3"
    aria-label="AI 助手模块导航"
  >
    <a-tooltip
      v-for="m in businessModules"
      :key="m.key"
      placement="right"
      :mouse-enter-delay="0.3"
      :overlay-class-name="'ai-nav-tip'"
    >
      <button
        type="button"
        class="relative flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent outline-none transition-colors"
        :class="btnClass(m.key)"
        :aria-label="m.label"
        @click="select(m)"
      >
        <component :is="iconMap[m.key]" class="h-[18px] w-[18px]" />
        <span
          v-if="!m.ready"
          class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
          aria-hidden="true"
        />
        <span
          v-if="active === m.key"
          class="absolute -left-2 top-1 bottom-1 w-[3px] rounded-r-full bg-primary"
          aria-hidden="true"
        />
      </button>
      <template #title>
        <div class="max-w-[180px]">
          <div class="font-medium">{{ m.label }}</div>
          <div v-if="m.description" class="mt-0.5 opacity-70">{{ m.description }}</div>
          <div v-if="!m.ready" class="mt-1 text-amber-300">建设中</div>
        </div>
      </template>
    </a-tooltip>

    <div class="my-1 h-px w-6 bg-border"></div>

    <a-tooltip
      v-for="m in systemModules"
      :key="m.key"
      placement="right"
      :mouse-enter-delay="0.3"
    >
      <button
        type="button"
        class="relative mt-auto flex h-8 w-8 items-center justify-center rounded-md border-none bg-transparent outline-none transition-colors"
        :class="btnClass(m.key)"
        :aria-label="m.label"
        @click="select(m)"
      >
        <component :is="iconMap[m.key]" class="h-[18px] w-[18px]" />
        <span
          v-if="active === m.key"
          class="absolute -left-2 top-1 bottom-1 w-[3px] rounded-r-full bg-primary"
          aria-hidden="true"
        />
      </button>
      <template #title>
        <div class="max-w-[180px]">
          <div class="font-medium">{{ m.label }}</div>
          <div v-if="m.description" class="mt-0.5 opacity-70">{{ m.description }}</div>
        </div>
      </template>
    </a-tooltip>
  </nav>
</template>