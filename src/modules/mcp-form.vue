<script lang="ts" setup>
import {
  Input as AInput,
  InputPassword as AInputPassword,
  InputNumber as AInputNumber,
  Modal as AModal,
  Select as ASelect,
  Textarea as ATextarea,
  message,
} from 'ant-design-vue';

import { computed, reactive, watch } from 'vue';

import type { IdentityMode, McpServer, McpTransport } from '../types';

defineOptions({ name: 'AiMcpForm' });

const props = defineProps<{
  open: boolean;
  data?: McpServer | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  submit: [data: Partial<McpServer>];
}>();

const transportOptions: Array<{ label: string; value: McpTransport }> = [
  { label: 'stdio（本地进程）', value: 'stdio' },
  { label: 'SSE', value: 'sse' },
  { label: 'Streamable HTTP', value: 'streamable-http' },
];

const identityOptions: Array<{ label: string; value: IdentityMode }> = [
  { label: '关闭', value: 'off' },
  { label: 'IDP Token 转发', value: 'idp_token' },
];

interface EnvPair {
  key: string;
  value: string;
}

interface FormState {
  name: string;
  description: string;
  transport: McpTransport;
  command: string;
  args: string;
  envPairs: EnvPair[];
  url: string;
  headers: string;
  identityMode: IdentityMode;
  timeout: number;
  sseReadTimeout: number;
  serverIdentifier: string;
  // OAuth 配置
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
}

const defaultState = (): FormState => ({
  name: '',
  description: '',
  transport: 'stdio',
  command: 'npx',
  args: '',
  envPairs: [],
  url: '',
  headers: '',
  identityMode: 'off',
  timeout: 30,
  sseReadTimeout: 300,
  serverIdentifier: '',
  clientId: '',
  clientSecret: '',
  tokenEndpoint: '',
});

const form = reactive<FormState>(defaultState());

const isStdio = computed(() => form.transport === 'stdio');

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    Object.assign(form, defaultState());
    if (props.data) {
      form.name = props.data.name;
      form.description = props.data.description ?? '';
      form.transport = props.data.transport;
      form.command = props.data.command ?? 'npx';
      form.args = (props.data.args ?? []).join(' ');
      form.envPairs = (props.data.env ?? []).map((e) => ({ key: e.key, value: e.value }));
      form.url = props.data.url ?? '';
      form.headers = (props.data.headers ?? [])
        .map((h) => `${h.key}: ${h.value}`)
        .join('\n');
      form.identityMode = props.data.identityMode ?? 'off';
      form.timeout = props.data.configuration?.timeout ?? 30;
      form.sseReadTimeout = props.data.configuration?.sseReadTimeout ?? 300;
      form.serverIdentifier = props.data.serverIdentifier ?? '';
      // 回填 OAuth 配置
      const auth = props.data.authentication as any;
      if (auth && typeof auth === 'object') {
        form.clientId = auth.clientId ?? '';
        form.tokenEndpoint = auth.tokenEndpoint ?? '';
      }
    }
  },
  { immediate: true },
);

function handleOk() {
  if (!form.name.trim()) {
    message.warning('请输入服务器名称');
    return;
  }
  if (isStdio.value && !form.command.trim()) {
    message.warning('stdio 传输需要填写启动命令');
    return;
  }
  if (!isStdio.value && !form.url.trim()) {
    message.warning('请填写服务器 URL');
    return;
  }

  // 编辑模式：保留原 id，不覆盖 enabled/status/tools 等运行时字段
  const isEdit = !!props.data?.id;
  const result: Partial<McpServer> = {
    name: form.name,
    description: form.description,
    transport: form.transport,
    identityMode: form.identityMode,
    serverIdentifier: form.serverIdentifier || form.name,
    configuration: {
      timeout: form.timeout,
      sseReadTimeout: form.sseReadTimeout,
    },
  };

  if (isEdit) {
    result.id = props.data!.id;
  } else {
    // 仅新建时设置初始值
    result.tools = [];
    result.resources = [];
    result.prompts = [];
    result.enabled = true;
    result.status = 'disconnected';
    result.updatedAt = Date.now();
  }

  if (isStdio.value) {
    result.command = form.command;
    result.args = form.args.split(/\s+/).filter(Boolean);
    // 环境变量：过滤空 key 的行
    result.env = form.envPairs.filter((e) => e.key.trim() !== '');
  } else {
    result.url = form.url;
    result.headers = form.headers
      .split('\n')
      .map((line) => {
        const idx = line.indexOf(':');
        if (idx < 0) return null;
        return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      })
      .filter((h): h is { key: string; value: string } => h !== null);
  }

  // OAuth 配置：identityMode=idp_token 且 clientId 有值时提交
  if (form.identityMode === 'idp_token' && form.clientId.trim()) {
    result.authentication = {
      clientId: form.clientId,
      tokenEndpoint: form.tokenEndpoint || undefined,
    };
    if (form.clientSecret) {
      result.clientSecret = form.clientSecret;
    }
  }

  emit('submit', result);
  emit('update:open', false);
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <a-modal
    :open="open"
    :title="data ? '编辑 MCP 服务器' : '新建 MCP 服务器'"
    :width="560"
    :ok-text="data ? '保存' : '创建'"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="space-y-3 py-2">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            名称 <span class="text-red-500">*</span>
          </label>
          <a-input v-model:value="form.name" placeholder="如：filesystem" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">传输类型</label>
          <a-select
            v-model:value="form.transport"
            class="w-full"
            :options="transportOptions"
          />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">描述</label>
        <a-input v-model:value="form.description" placeholder="简要描述 MCP 服务器功能" />
      </div>

      <!-- stdio 传输配置 -->
      <template v-if="isStdio">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            启动命令 <span class="text-red-500">*</span>
          </label>
          <a-input v-model:value="form.command" placeholder="npx" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">命令参数（空格分隔）</label>
          <a-input v-model:value="form.args" placeholder="-y @modelcontextprotocol/server-filesystem /workspace" />
        </div>
        <!-- 环境变量编辑器 -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label class="text-[12px] text-muted-foreground">环境变量</label>
            <button
              type="button"
              class="flex items-center gap-1 text-[11px] text-primary hover:opacity-80"
              @click="form.envPairs.push({ key: '', value: '' })"
            >
              <span>+</span> 添加
            </button>
          </div>
          <div v-if="form.envPairs.length > 0" class="space-y-1">
            <div
              v-for="(pair, index) in form.envPairs"
              :key="index"
              class="flex items-center gap-1"
            >
              <a-input
                v-model:value="pair.key"
                placeholder="KEY"
                class="flex-1"
              />
              <span class="text-muted-foreground">=</span>
              <a-input
                v-model:value="pair.value"
                placeholder="VALUE"
                class="flex-1"
              />
              <button
                type="button"
                class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-red-400 hover:bg-red-500/10"
                @click="form.envPairs.splice(index, 1)"
              >
                ×
              </button>
            </div>
          </div>
          <div v-else class="text-[11px] text-muted-foreground/60">
            点击「添加」配置进程环境变量
          </div>
        </div>
      </template>

      <!-- sse / http 传输配置 -->
      <template v-else>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            URL <span class="text-red-500">*</span>
          </label>
          <a-input v-model:value="form.url" placeholder="https://mcp.example.com/sse" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            请求头（每行一个，格式 Key: Value）
          </label>
          <a-textarea
            v-model:value="form.headers"
            :rows="3"
            placeholder="Authorization: Bearer xxx"
            class="font-mono text-[12px]"
          />
        </div>
      </template>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">请求超时（秒）</label>
          <a-input-number v-model:value="form.timeout" :min="5" :max="300" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">SSE 读取超时（秒）</label>
          <a-input-number v-model:value="form.sseReadTimeout" :min="30" :max="3600" class="w-full" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">身份转发</label>
          <a-select
            v-model:value="form.identityMode"
            class="w-full"
            :options="identityOptions"
          />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">服务器标识符</label>
          <a-input v-model:value="form.serverIdentifier" placeholder="留空则使用名称" />
        </div>
      </div>

      <!-- OAuth 配置（identityMode=idp_token 时展示） -->
      <div v-if="form.identityMode === 'idp_token'" class="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
        <div class="text-[12px] font-medium text-blue-500">OAuth 认证配置</div>
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">Client ID</label>
          <a-input v-model:value="form.clientId" placeholder="OAuth Client ID" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">Client Secret</label>
          <a-input-password v-model:value="form.clientSecret" placeholder="留空编辑时保留原值" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">Token Endpoint</label>
          <a-input v-model:value="form.tokenEndpoint" placeholder="https://idp.example.com/oauth2/token" />
        </div>
      </div>
    </div>
  </a-modal>
</template>