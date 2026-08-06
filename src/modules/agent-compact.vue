<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message, Modal } from 'ant-design-vue';

import { onMounted, ref } from 'vue';

import type { Agent } from '../types';

import {
  deleteAgent,
  listAgents,
  saveAgent,
  toggleAgentEnabled,
} from '../api/agent';
import { useBackendHealth } from '../composables/use-backend-health';

import AgentForm from './agent-form.vue';

defineOptions({ name: 'AiAgentCompact' });

const emit = defineEmits<{
  'start-chat': [agentId: string];
}>();

const PlusIcon = createIconifyIcon('lucide:plus');
const MessageIcon = createIconifyIcon('lucide:message-square');
const EditIcon = createIconifyIcon('lucide:pencil');
const TrashIcon = createIconifyIcon('lucide:trash-2');

const agents = ref<Agent[]>([]);
const loading = ref(false);
const formOpen = ref(false);
const editingData = ref<Agent | null>(null);

const health = useBackendHealth();

const strategyText: Record<string, string> = {
  function_calling: 'FC',
  react: 'ReAct',
};

async function loadAgents() {
  loading.value = true;
  try {
    agents.value = await listAgents();
  } catch {
    agents.value = [];
  } finally {
    loading.value = false;
  }
}

async function toggleEnabled(agent: Agent) {
  if (agent.isBuiltin) return;
  const next = !agent.enabled;
  try {
    await toggleAgentEnabled(agent.id, next);
    agent.enabled = next;
  } catch {
    message.error('切换失败');
  }
}

function startChat(agent: Agent) {
  emit('start-chat', agent.id);
}

function handleAdd() {
  editingData.value = null;
  formOpen.value = true;
}

function handleEdit(agent: Agent) {
  editingData.value = agent;
  formOpen.value = true;
}

async function handleDelete(agent: Agent) {
  // 内置 Agent 禁止删除
  if (agent.isBuiltin) {
    message.warning('内置智能体不可删除');
    return;
  }
  Modal.confirm({
    title: '删除智能体',
    content: `确定要删除「${agent.name}」吗？删除后不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteAgent(agent.id);
        const idx = agents.value.findIndex((a) => a.id === agent.id);
        if (idx !== -1) {
          agents.value.splice(idx, 1);
        }
        message.success(`智能体 ${agent.name} 已删除`);
      } catch {
        message.error('删除失败');
      }
    },
  });
}

async function handleSubmit(data: Partial<Agent>) {
  const isEdit = !!editingData.value?.id;
  try {
    const id = await saveAgent({
      id: editingData.value?.id,
      name: data.name ?? '未命名',
      avatar: data.avatar ?? '🤖',
      description: data.description ?? '',
      systemPrompt: data.systemPrompt ?? '',
      desensitizeRules: data.desensitizeRules ?? [],
      outputOptimization: data.outputOptimization,
      allowedTools: data.allowedTools ?? ['read_file'],
      allowedMcpServers: data.allowedMcpServers ?? [],
      allowedSkills: data.allowedSkills ?? [],
      allowedKnowledgeBases: data.allowedKnowledgeBases ?? [],
      modelId: data.modelId ?? '',
      modelParams: data.modelParams ?? { temperature: 0.5, maxTokens: 8192, topP: 0.9 },
      strategy: data.strategy ?? 'function_calling',
      maxIterations: data.maxIterations ?? 5,
      permissions: data.permissions ?? {
        fileRead: 'cwd',
        fileWrite: 'none',
        commandExec: false,
        commandWhitelist: [],
      },
      enabled: true,
    });
    const agentRecord: Agent = {
      id,
      name: data.name ?? '未命名',
      avatar: data.avatar ?? '🤖',
      description: data.description ?? '',
      systemPrompt: data.systemPrompt ?? '',
      desensitizeRules: data.desensitizeRules ?? [],
      outputOptimization: data.outputOptimization,
      allowedTools: data.allowedTools ?? ['read_file'],
      allowedMcpServers: data.allowedMcpServers ?? [],
      allowedSkills: data.allowedSkills ?? [],
      allowedKnowledgeBases: data.allowedKnowledgeBases ?? [],
      modelId: data.modelId ?? '',
      modelParams: data.modelParams ?? { temperature: 0.5, maxTokens: 8192, topP: 0.9 },
      strategy: data.strategy ?? 'function_calling',
      maxIterations: data.maxIterations ?? 5,
      permissions: data.permissions ?? {
        fileRead: 'cwd',
        fileWrite: 'none',
        commandExec: false,
        commandWhitelist: [],
      },
      // 编辑模式下保留原记录的内置状态与使用次数（后端 update 不修改这两个字段）
      isBuiltin: isEdit ? (editingData.value?.isBuiltin ?? false) : false,
      enabled: true,
      color: data.color ?? '#6366f1',
      usageCount: isEdit ? (editingData.value?.usageCount ?? 0) : 0,
      updatedAt: Date.now(),
    };
    if (isEdit) {
      // 更新：替换原记录
      const idx = agents.value.findIndex((a) => a.id === id);
      if (idx !== -1) {
        agents.value.splice(idx, 1, agentRecord);
      }
      message.success(`智能体 ${agentRecord.name} 已更新`);
    } else {
      // 创建：插入到列表头部
      agents.value.unshift(agentRecord);
      message.success(`智能体 ${agentRecord.name} 已创建`);
    }
  } catch {
    message.error(isEdit ? '更新失败' : '创建失败');
  }
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadAgents();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">Agents 管理</span>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
        @click="handleAdd"
      >
        <component :is="PlusIcon" class="h-3 w-3" />
        新建 Agent
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2.5">
      <!-- 离线占位：避免空列表时让用户误以为"没有 Agent" -->
      <div
        v-if="health.state === 'disconnected'"
        class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
      >
        <div class="text-2xl">⚠</div>
        <div>后端未连接，无法加载 Agent 列表</div>
        <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
      </div>

      <div v-else class="space-y-1.5">
        <div
          v-for="agent in agents"
          :key="agent.id"
          class="rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
        >
          <!-- 卡片头部：含头像/名称/描述/启用开关/操作按钮/展开箭头 -->
          <div class="px-3 py-2">
            <!-- 第一行：名称区域 + 启用开关 -->
            <div class="flex items-start gap-2.5">
              <div
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[16px]"
                :style="{ backgroundColor: `${agent.color}20` }"
              >
                {{ agent.avatar }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-[12px] font-medium">{{ agent.name }}</span>
                  <span
                    v-if="agent.isBuiltin"
                    class="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground"
                  >
                    内置
                  </span>
                  <span
                    class="rounded px-1 py-px text-[9px] font-medium"
                    :style="{ backgroundColor: `${agent.color}20`, color: agent.color }"
                  >
                    {{ strategyText[agent.strategy] }}
                  </span>
                </div>
                <div class="truncate text-[11px] text-muted-foreground">
                  {{ agent.description }}
                </div>
              </div>
              <!-- 右侧：启用开关 -->
              <button
                type="button"
                :disabled="agent.isBuiltin"
                class="relative mt-0.5 h-4 w-7 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                :class="agent.enabled ? 'bg-primary' : 'bg-muted'"
                :title="agent.isBuiltin ? '内置不可禁用' : (agent.enabled ? '点击禁用' : '点击启用')"
                @click.stop="toggleEnabled(agent)"
              >
                <span
                  class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                  :class="agent.enabled ? 'left-[14px]' : 'left-0.5'"
                />
              </button>
            </div>

            <!-- 第二行：操作按钮（始终可见，不依赖展开） -->
            <div class="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                class="flex flex-1 items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/5 py-1.5 text-[11px] text-primary transition-colors hover:bg-primary/10"
                @click.stop="startChat(agent)"
              >
                <component :is="MessageIcon" class="h-3 w-3" />
                测试对话
              </button>
              <button
                type="button"
                class="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="编辑"
                @click.stop="handleEdit(agent)"
              >
                <component :is="EditIcon" class="h-3 w-3" />
                <span>编辑</span>
              </button>
              <button
                type="button"
                :disabled="agent.isBuiltin"
                class="flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background disabled:hover:text-muted-foreground dark:hover:bg-red-950/30"
                :title="agent.isBuiltin ? '内置不可删除' : '删除'"
                @click.stop="handleDelete(agent)"
              >
                <component :is="TrashIcon" class="h-3 w-3" />
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AgentForm v-model:open="formOpen" :data="editingData" @submit="handleSubmit" />
  </div>
</template>