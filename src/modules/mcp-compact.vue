<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message, Modal } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';

import type { McpServer } from '../types';

import { mcpStatusMap, mcpTransportMap } from '../constants';
import {
  deleteMcpServer,
  listMcpServers,
  refreshMcpTools,
  saveMcpServer,
  testMcpConnection,
  toggleMcpServerEnabled,
} from '../api/mcp';
import { useBackendHealth } from '../composables/use-backend-health';

import McpForm from './mcp-form.vue';

defineOptions({ name: 'AiMcpCompact' });

const PlusIcon = createIconifyIcon('lucide:plus');
const ChevronIcon = createIconifyIcon('lucide:chevron-down');
const RefreshIcon = createIconifyIcon('lucide:rotate-cw');
const TerminalIcon = createIconifyIcon('lucide:terminal');
const RadioIcon = createIconifyIcon('lucide:radio');
const GlobeIcon = createIconifyIcon('lucide:globe');
const FileIcon = createIconifyIcon('lucide:file-text');
const WandIcon = createIconifyIcon('lucide:wand-2');
const EditIcon = createIconifyIcon('lucide:pencil');
const TrashIcon = createIconifyIcon('lucide:trash-2');

const servers = ref<McpServer[]>([]);
const loading = ref(false);
const expandedId = ref<string>('');
const reconnectingId = ref<string>('');
const refreshingToolsId = ref<string>('');
const formOpen = ref(false);
const editingData = ref<McpServer | null>(null);

const health = useBackendHealth();

const transportIcon: Record<string, any> = {
  stdio: TerminalIcon,
  sse: RadioIcon,
  'streamable-http': GlobeIcon,
};

const approvalText: Record<string, string> = {
  always: '每次确认',
  once: '会话一次',
  never: '自动',
};

const approvalColor: Record<string, string> = {
  always: 'text-amber-500',
  once: 'text-blue-500',
  never: 'text-emerald-500',
};

// 后端 McpServerVO 在 list 接口中可能不返回 tools/resources/prompts，
// 且 configuration 可能仅含部分字段。此处统一归一化，避免模板直接
// 访问 server.tools.length / server.configuration.sseReadTimeout 等时
// 因字段为 undefined 抛 TypeError，导致组件渲染损坏（表现为点击无反应）。
function normalizeServer(s: Partial<McpServer>): McpServer {
  return {
    ...s,
    tools: s.tools ?? [],
    resources: s.resources ?? [],
    prompts: s.prompts ?? [],
    configuration: {
      timeout: 30,
      sseReadTimeout: 300,
      ...(s.configuration ?? {}),
    },
  } as McpServer;
}

async function loadServers() {
  loading.value = true;
  try {
    const list = await listMcpServers();
    servers.value = (list ?? []).map(normalizeServer);
  } catch {
    servers.value = [];
  } finally {
    loading.value = false;
  }
}

const summary = computed(() => {
  const connected = servers.value.filter((s) => s.status === 'connected').length;
  const error = servers.value.filter((s) => s.status === 'error').length;
  const disconnected = servers.value.filter((s) => s.status === 'disconnected').length;
  return { connected, error, disconnected };
});

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? '' : id;
}

async function reconnect(server: McpServer) {
  reconnectingId.value = server.id;
  server.status = 'connecting';
  try {
    const updated = await testMcpConnection(server.id);
    server.status = updated.status ?? 'connected';
    server.tools = updated.tools ?? server.tools;
    server.lastError = updated.lastError;
    if (server.status === 'connected') {
      message.success(`${server.name} 连接成功`);
    } else if (server.status === 'error') {
      message.error(`${server.name} 连接失败`);
    }
  } catch {
    server.status = 'error';
    server.lastError = '连接测试失败';
    message.error(`${server.name} 连接失败`);
  } finally {
    reconnectingId.value = '';
  }
}

async function handleRefreshTools(server: McpServer) {
  refreshingToolsId.value = server.id;
  try {
    const tools = await refreshMcpTools(server.id);
    server.tools = tools ?? [];
    message.success(`已刷新 ${server.tools.length} 个工具`);
  } catch {
    message.error('刷新工具失败');
  } finally {
    refreshingToolsId.value = '';
  }
}

async function toggleEnabled(server: McpServer) {
  const next = !server.enabled;
  try {
    await toggleMcpServerEnabled(server.id, next);
    server.enabled = next;
    // 后端 toggleEnabled 会重置 status='disconnected'，同步本地
    server.status = 'disconnected';
  } catch {
    message.error('切换失败');
  }
}

function handleAdd() {
  editingData.value = null;
  formOpen.value = true;
}

function handleEdit(server: McpServer) {
  editingData.value = server;
  formOpen.value = true;
}

function handleDelete(server: McpServer) {
  Modal.confirm({
    title: '删除 MCP 服务器',
    content: `确定要删除「${server.name}」吗？关联的工具清单将一并清除。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteMcpServer(server.id);
        servers.value = servers.value.filter((s) => s.id !== server.id);
        message.success(`已删除 ${server.name}`);
      } catch {
        message.error('删除失败');
      }
    },
  });
}

async function handleSubmit(data: Partial<McpServer>) {
  // 编辑模式：保留 id 调用 saveMcpServer 更新
  if (editingData.value?.id) {
    try {
      await saveMcpServer({
        id: editingData.value.id,
        name: data.name ?? editingData.value.name,
        description: data.description,
        transport: data.transport ?? editingData.value.transport,
        command: data.command,
        args: data.args,
        env: data.env,
        url: data.url,
        headers: data.headers,
        configuration: data.configuration,
        identityMode: data.identityMode,
        authentication: data.authentication,
        clientSecret: data.clientSecret,
        enabled: editingData.value.enabled,
      });
      // 刷新列表（最简方式，保证 server.tools 等关联数据与服务端一致）
      await loadServers();
      message.success(`MCP 服务器 ${data.name} 已更新`);
    } catch {
      message.error('更新失败');
    }
    return;
  }
  // 新建模式
  try {
    const id = await saveMcpServer({
      name: data.name ?? '未命名',
      description: data.description ?? '',
      transport: data.transport ?? 'stdio',
      command: data.command,
      args: data.args,
      env: data.env,
      url: data.url,
      headers: data.headers,
      configuration: data.configuration ?? { timeout: 30, sseReadTimeout: 300 },
      identityMode: data.identityMode ?? 'off',
      enabled: true,
    });
    const newServer: McpServer = {
      id,
      name: data.name ?? '未命名',
      description: data.description ?? '',
      transport: data.transport ?? 'stdio',
      command: data.command,
      args: data.args,
      env: data.transport === 'stdio' ? [] : undefined,
      url: data.url,
      headers: data.headers,
      configuration: data.configuration ?? { timeout: 30, sseReadTimeout: 300 },
      identityMode: data.identityMode ?? 'off',
      serverIdentifier: data.serverIdentifier ?? data.name,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
      enabled: true,
      updatedAt: Date.now(),
    };
    servers.value.unshift(newServer);
    message.success(`MCP 服务器 ${newServer.name} 已创建`);
  } catch {
    message.error('创建失败');
  }
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadServers();
});
</script>

<template>
  <!-- 离线占位：整页替换 -->
  <div
    v-if="health.state === 'disconnected'"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
  >
    <div class="text-2xl">⚠</div>
    <div>后端未连接，无法加载 MCP 服务器</div>
    <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
  </div>
  <div v-else class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium">MCP 管理</span>
        <span class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span class="flex items-center gap-0.5">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {{ summary.connected }}
          </span>
          <span v-if="summary.error > 0" class="flex items-center gap-0.5">
            <span class="h-1.5 w-1.5 rounded-full bg-red-500" />
            {{ summary.error }}
          </span>
        </span>
      </div>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
        @click="handleAdd"
      >
        <component :is="PlusIcon" class="h-3 w-3" />
        新建
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2.5">
      <div class="space-y-1.5">
        <div
          v-for="server in servers"
          :key="server.id"
          class="rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
        >
          <!-- 卡片头部 -->
          <div
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2"
            @click="toggle(server.id)"
          >
            <div
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-muted"
            >
              <component :is="transportIcon[server.transport]" class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium">{{ server.name }}</span>
                <span class="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">
                  {{ mcpTransportMap[server.transport].text }}
                </span>
              </div>
              <div class="truncate text-[11px] text-muted-foreground">
                {{ server.description }}
              </div>
            </div>
            <div class="flex flex-shrink-0 items-center gap-2">
              <span class="flex items-center gap-1 text-[10px]" :class="mcpStatusMap[server.status].text_color">
                <span class="h-1.5 w-1.5 rounded-full" :class="mcpStatusMap[server.status].dot" />
                {{ mcpStatusMap[server.status].text }}
              </span>
              <span class="text-[10px] text-muted-foreground">{{ server.tools.length }} tools</span>
              <!-- 操作按钮组（阻止冒泡避免触发卡片展开） -->
              <button
                type="button"
                class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                title="编辑"
                @click.stop="handleEdit(server)"
              >
                <component :is="EditIcon" class="h-3 w-3" />
              </button>
              <button
                type="button"
                class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                title="删除"
                @click.stop="handleDelete(server)"
              >
                <component :is="TrashIcon" class="h-3 w-3" />
              </button>
              <component
                :is="ChevronIcon"
                class="h-3.5 w-3.5 text-muted-foreground transition-transform"
                :class="expandedId === server.id ? 'rotate-180' : ''"
              />
            </div>
          </div>

          <!-- 展开内容 -->
          <div v-if="expandedId === server.id" class="border-t border-border px-3 py-2.5">
            <!-- 连接信息 -->
            <div class="mb-2 space-y-1 text-[11px]">
              <div v-if="server.command" class="flex items-center gap-1">
                <span class="text-muted-foreground">命令:</span>
                <code class="rounded bg-muted px-1 py-0.5 text-[10px]">{{ server.command }} {{ (server.args ?? []).join(' ') }}</code>
              </div>
              <div v-if="server.url" class="flex items-center gap-1">
                <span class="text-muted-foreground">URL:</span>
                <code class="truncate rounded bg-muted px-1 py-0.5 text-[10px]">{{ server.url }}</code>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-muted-foreground">超时:</span>
                <span>{{ server.configuration.timeout }}s / SSE {{ server.configuration.sseReadTimeout }}s</span>
              </div>
              <div v-if="server.identityMode === 'idp_token'" class="flex items-center gap-1">
                <span class="text-muted-foreground">身份转发:</span>
                <span class="text-blue-500">IDP Token</span>
              </div>
              <div v-if="server.authentication" class="flex items-center gap-1">
                <span class="text-muted-foreground">认证:</span>
                <span>OAuth · {{ server.authentication.clientId }}</span>
              </div>
              <div v-if="server.lastError" class="rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-500">
                {{ server.lastError }}
              </div>
            </div>

            <!-- 工具列表 -->
            <div class="mb-2">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-[10px] font-medium text-muted-foreground">Tools ({{ server.tools.length }})</span>
                <button
                  type="button"
                  class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-primary"
                  :disabled="refreshingToolsId === server.id"
                  @click.stop="handleRefreshTools(server)"
                >
                  <component :is="RefreshIcon" class="h-2.5 w-2.5" :class="refreshingToolsId === server.id ? 'animate-spin' : ''" />
                  {{ refreshingToolsId === server.id ? '刷新中…' : '刷新' }}
                </button>
              </div>
              <div class="space-y-1">
                <div
                  v-for="tool in server.tools"
                  :key="tool.name"
                  class="flex items-center gap-2 rounded bg-muted/50 px-2 py-1"
                >
                  <component :is="WandIcon" class="h-3 w-3 flex-shrink-0 text-primary" />
                  <span class="flex-1 font-mono text-[11px]">{{ tool.name }}</span>
                  <span class="text-[10px] text-muted-foreground truncate max-w-[120px]">{{ tool.description }}</span>
                  <span class="flex-shrink-0 text-[10px]" :class="approvalColor[tool.approvalPolicy]">
                    {{ approvalText[tool.approvalPolicy] }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 资源列表 -->
            <div v-if="server.resources.length > 0" class="mb-2">
              <div class="mb-1 text-[10px] font-medium text-muted-foreground">Resources ({{ server.resources.length }})</div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="res in server.resources"
                  :key="res.uri"
                  class="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  <component :is="FileIcon" class="h-2.5 w-2.5" />
                  {{ res.name }}
                </span>
              </div>
            </div>

            <!-- 提示模板 -->
            <div v-if="server.prompts.length > 0" class="mb-2">
              <div class="mb-1 text-[10px] font-medium text-muted-foreground">Prompts ({{ server.prompts.length }})</div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="prompt in server.prompts"
                  :key="prompt.name"
                  class="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-500"
                >
                  {{ prompt.name }}
                </span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent"
                :disabled="reconnectingId === server.id || !server.enabled"
                @click.stop="reconnect(server)"
              >
                <component :is="RefreshIcon" class="h-3 w-3" :class="reconnectingId === server.id ? 'animate-spin' : ''" />
                {{ reconnectingId === server.id ? '重连中…' : '重连' }}
              </button>
              <button
                type="button"
                class="relative h-4 w-7 rounded-full transition-colors"
                :class="server.enabled ? 'bg-primary' : 'bg-muted'"
                @click.stop="toggleEnabled(server)"
              >
                <span
                  class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                  :class="server.enabled ? 'left-[14px]' : 'left-0.5'"
                />
              </button>
              <span class="text-[10px] text-muted-foreground">{{ server.enabled ? '已启用' : '已停用' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <McpForm v-model:open="formOpen" :data="editingData" @submit="handleSubmit" />
  </div>
</template>