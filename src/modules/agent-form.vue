<script lang="ts" setup>
import {
  Input as AInput,
  InputNumber as AInputNumber,
  Modal as AModal,
  Select as ASelect,
  Switch as ASwitch,
  Textarea as ATextarea,
  message,
} from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import type { Agent, AgentStrategy, DesensitizeRule } from '../types';

import { listMcpServers } from '../api/mcp';
import { listProviders } from '../api/provider';
import { listKnowledgeBases } from '../api/knowledge';
import { listDatasources } from '../api/nl2sql';

defineOptions({ name: 'AiAgentForm' });

const props = defineProps<{
  open: boolean;
  data?: Agent | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  submit: [data: Partial<Agent>];
}>();

/** 模型选项：从已启用供应商的模型列表动态加载，按 modelType='chat' 过滤 */
const modelOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadModelOptions() {
  try {
    const providers = await listProviders({ enabled: true });
    const options: Array<{ label: string; value: string }> = [];
    providers.forEach((p) => {
      (p.models ?? []).forEach((m) => {
        if (m.modelType === 'chat') {
          options.push({
            label: `${p.name} · ${m.displayName || m.name}`,
            value: m.id,
          });
        }
      });
    });
    modelOptions.value = options;
  } catch {
    modelOptions.value = [];
  }
}

/** MCP 服务器选项：已启用的 MCP 服务器列表 */
const mcpServerOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadMcpServerOptions() {
  try {
    const servers = await listMcpServers();
    mcpServerOptions.value = servers.map((s) => ({
      label: `${s.name} (${s.transport})`,
      value: s.id,
    }));
  } catch {
    mcpServerOptions.value = [];
  }
}

/** 知识库选项（RAG 绑定：Agent 回答时检索这些知识库） */
const kbOptions = ref<Array<{ label: string; value: string }>>([]);

/** 数据源选项（P2-T6：Agent 可查的 NL2SQL 数据源；不选 = 全局不限定） */
const dsOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadKbOptions() {
  try {
    const kbs = await listKnowledgeBases();
    kbOptions.value = kbs.map((k) => ({
      label: k.name,
      value: k.id,
    }));
  } catch (e) {
    // 缺陷⑥：失败原因必须显形（此前静默吞掉导致下拉空且无从排查）
    console.warn('[agent-form] 知识库选项加载失败', e);
    kbOptions.value = [];
  }
}

async function loadDsOptions() {
  try {
    const dss = await listDatasources();
    dsOptions.value = (dss ?? []).map((d) => ({
      label: `${d.name}（${d.defaultDb ?? '库'}）`,
      value: String(d.id),
    }));
  } catch (e) {
    console.warn('[agent-form] 数据源选项加载失败', e);
    dsOptions.value = [];
  }
}

onMounted(() => {
  loadModelOptions();
  loadMcpServerOptions();
  loadKbOptions();
});

/** T9：{{model}} 占位符提示（脚本常量，避免模板内嵌套花括号） */
const modelPlaceholder = '{{model}}';

const strategyOptions: Array<{ label: string; value: AgentStrategy }> = [
  { label: 'Function Calling', value: 'function_calling' },
  { label: 'ReAct', value: 'react' },
];

const colorOptions = [
  { label: '翡翠绿', value: '#10b981' },
  { label: '红色', value: '#ef4444' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '琥珀', value: '#f59e0b' },
  { label: '青色', value: '#06b6d4' },
  { label: '靛蓝', value: '#6366f1' },
  { label: '粉色', value: '#ec4899' },
  { label: '石板灰', value: '#64748b' },
];

/** 内置脱敏预设规则（与后端 DesensitizeRules 预设保持一致） */
const desensitizePresets = [
  { key: 'phone', label: '手机号', desc: '11 位手机号 → 前3后4，如 138****5678' },
  { key: 'email', label: '邮箱', desc: '用户名脱敏保留域名，如 z***@a.com' },
  { key: 'idCard', label: '身份证号', desc: '18 位身份证 → 保留前6后4' },
  { key: 'bankCard', label: '银行卡号', desc: '银行卡号 → 前4后4' },
  { key: 'password', label: '密码/Token', desc: 'password、token、secret 等占位符' },
  { key: 'apiKey', label: 'API Key', desc: 'sk-xxx 等长密钥串' },
  { key: 'ip', label: 'IP 地址', desc: 'IPv4 / IPv6 地址' },
  { key: 'address', label: '详细地址', desc: '住址等详细地址信息' },
] as const;

interface FormState {
  name: string;
  avatar: string;
  description: string;
  routeKeywords: string;
  modelId: string;
  systemPrompt: string;
  desensitizeRules: DesensitizeRule[];
  outputOptimizationEnabled: boolean;
  outputOptimizationInstructions: string;
  strategy: AgentStrategy;
  maxIterations: number;
  color: string;
  temperature: number;
  maxTokens: number;
  allowedMcpServers: string[];
  allowedKnowledgeBases: string[];
  allowedDatasources: string[] | null;
}

const defaultState = (): FormState => ({
  name: '',
  avatar: '🤖',
  description: '',
  routeKeywords: '',
  modelId: modelOptions.value[0]?.value ?? '',
  systemPrompt:
    '你是一个智能助手，请根据用户的问题和提供的页面上下文给出准确、简洁的回答。',
  desensitizeRules: [
    { key: 'phone', enabled: true },
    { key: 'email', enabled: true },
    { key: 'apiKey', enabled: true },
  ],
  outputOptimizationEnabled: false,
  outputOptimizationInstructions: '',
  strategy: 'function_calling',
  maxIterations: 5,
  color: '#6366f1',
  temperature: 0.5,
  maxTokens: 8192,
  allowedMcpServers: [],
  allowedKnowledgeBases: [],
  allowedDatasources: null,
});

const form = reactive<FormState>(defaultState());

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    // 每次打开时刷新模型/知识库选项（供应商与知识库可能已变更）
    loadModelOptions();
    loadKbOptions();
    loadDsOptions();
    Object.assign(form, defaultState());
    if (props.data) {
      form.name = props.data.name;
      form.avatar = props.data.avatar;
      form.description = props.data.description;
      form.routeKeywords = props.data.routeKeywords ?? '';
      form.modelId = props.data.modelId;
      form.systemPrompt = props.data.systemPrompt;
      form.desensitizeRules = (props.data.desensitizeRules ?? []).map((r) => ({
        key: r.key,
        enabled: r.enabled,
        label: r.label,
        pattern: r.pattern,
      }));
      form.outputOptimizationEnabled =
        props.data.outputOptimization?.enabled ?? false;
      form.outputOptimizationInstructions =
        props.data.outputOptimization?.instructions ?? '';
      form.strategy = props.data.strategy;
      form.maxIterations = props.data.maxIterations;
      form.color = props.data.color ?? '#6366f1';
      form.temperature = props.data.modelParams.temperature;
      form.maxTokens = props.data.modelParams.maxTokens;
      form.allowedMcpServers = props.data.allowedMcpServers ?? [];
      form.allowedKnowledgeBases = props.data.allowedKnowledgeBases ?? [];
      form.allowedDatasources = props.data.allowedDatasources ?? null;
    }
  },
  { immediate: true },
);

/** 预设规则是否启用 */
function isPresetEnabled(key: string): boolean {
  return form.desensitizeRules.find((r) => r.key === key)?.enabled ?? false;
}

/** 切换预设规则启用状态 */
function togglePreset(key: string, checked: boolean) {
  const existing = form.desensitizeRules.find((r) => r.key === key);
  if (existing) {
    existing.enabled = checked;
  } else {
    form.desensitizeRules.push({ key, enabled: checked });
  }
}

/** 当前已配置的自定义规则（带 label / pattern 的非预设项） */
const customRules = computed(() =>
  form.desensitizeRules
    .map((r, index) => ({ ...r, _index: index }))
    .filter(
      (r) =>
        !desensitizePresets.some((p) => p.key === r.key) &&
        (r.label || r.pattern),
    ),
);

function addCustomRule() {
  form.desensitizeRules.push({
    key: 'custom',
    enabled: true,
    label: '',
    pattern: '',
  });
}

function removeRule(index: number) {
  form.desensitizeRules.splice(index, 1);
}

function handleOk() {
  if (!form.name.trim()) {
    message.warning('请输入智能体名称');
    return;
  }
  if (!form.systemPrompt.trim()) {
    message.warning('请输入系统提示词');
    return;
  }
  const result: Partial<Agent> = {
    name: form.name,
    avatar: form.avatar || '🤖',
    description: form.description,
    routeKeywords: form.routeKeywords,
    modelId: form.modelId,
    systemPrompt: form.systemPrompt,
    desensitizeRules: form.desensitizeRules.filter(
      (r) => r.key !== 'custom' || (r.label && r.pattern),
    ),
    outputOptimization: {
      enabled: form.outputOptimizationEnabled,
      instructions: form.outputOptimizationInstructions,
    },
    strategy: form.strategy,
    maxIterations: form.maxIterations,
    color: form.color,
    modelParams: {
      temperature: form.temperature,
      maxTokens: form.maxTokens,
      topP: 0.9,
    },
    allowedTools: ['read_file', 'grep'],
    allowedMcpServers: form.allowedMcpServers,
    allowedSkills: [],
    allowedKnowledgeBases: form.allowedKnowledgeBases,
    allowedDatasources: form.allowedDatasources,
    permissions: {
      fileRead: 'cwd',
      fileWrite: 'none',
      commandExec: false,
      commandWhitelist: [],
    },
    // isBuiltin / usageCount 由父组件（agent-compact.vue）在编辑模式下从原记录保留，
    // 新建时默认为 false / 0。此处不传递，避免覆盖父组件逻辑。
    enabled: true,
    updatedAt: Date.now(),
  };
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
    :title="data ? '编辑智能体' : '新建智能体'"
    :width="560"
    :ok-text="data ? '保存' : '创建'"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="space-y-3 py-2">
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">头像</label>
          <a-input v-model:value="form.avatar" placeholder="🤖" :maxlength="2" />
        </div>
        <div class="col-span-2">
          <label class="mb-1 block text-[12px] text-muted-foreground">
            名称 <span class="text-red-500">*</span>
          </label>
          <a-input v-model:value="form.name" placeholder="如：代码审查员" />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">描述</label>
        <a-input v-model:value="form.description" placeholder="简要描述智能体职责" />
            </div>
            <div>
              <label class="mb-1 block text-[11px] text-muted-foreground">路由关键词（逗号分隔，默认模式规则层匹配）</label>
              <input
                v-model="form.routeKeywords"
                class="h-7 w-full rounded border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                placeholder="如：统计,订单,数据"
              />
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          系统提示词 <span class="text-red-500">*</span>
        </label>
        <a-textarea
          v-model:value="form.systemPrompt"
          :rows="12"
          :placeholder="`定义智能体的角色、行为与约束。支持 ${modelPlaceholder} 占位符（运行时替换为当前模型名）`"
          class="font-mono text-[12px] leading-5"
        />
        <div class="mt-1 text-[10px] leading-4 text-muted-foreground">
          提示：这是智能体人格与行为的唯一配置来源。支持占位符
          <code class="rounded bg-muted/60 px-1">{{ modelPlaceholder }}</code>
          （运行时替换为当前模型名，用于身份锚定等场景）。
        </div>
      </div>

      <div
        class="rounded-lg border border-orange-200/60 bg-orange-50/40 p-3 dark:border-orange-900/40 dark:bg-orange-950/20"
      >
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] font-medium text-orange-700 dark:text-orange-300"
              >敏感信息过滤规则</span
            >
            <span class="text-[11px] text-muted-foreground"
              >命中后回复自动脱敏</span
            >
          </div>
          <span class="text-[11px] text-muted-foreground"
            >已启用
            <span class="font-semibold text-orange-600">{{
              form.desensitizeRules.filter((r) => r.enabled).length
            }}</span
            >
            项</span
          >
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="preset in desensitizePresets"
            :key="preset.key"
            class="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-1.5"
          >
            <div class="min-w-0">
              <div class="text-[12px] font-medium">{{ preset.label }}</div>
              <div class="truncate text-[10px] text-muted-foreground">
                {{ preset.desc }}
              </div>
            </div>
            <a-switch
              :checked="isPresetEnabled(preset.key)"
              size="small"
              @change="(c) => togglePreset(preset.key, Boolean(c))"
            />
          </div>
        </div>

        <div class="mt-2 border-t border-orange-200/60 pt-2 dark:border-orange-900/40">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-[11px] text-muted-foreground">自定义规则（正则匹配）</span>
            <button
              type="button"
              class="text-[11px] text-primary hover:underline"
              @click="addCustomRule"
            >
              + 添加
            </button>
          </div>
          <div v-if="customRules.length" class="space-y-1.5">
            <div
              v-for="rule in customRules"
              :key="rule._index"
              class="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1"
            >
              <a-input
                v-model:value="rule.label"
                placeholder="规则名称"
                class="flex-1"
                size="small"
              />
              <a-input
                v-model:value="rule.pattern"
                placeholder="正则表达式，如 \\d{4} \\*"
                class="flex-[1.4]"
                size="small"
              />
              <a-switch v-model:checked="rule.enabled" size="small" />
              <button
                type="button"
                class="text-muted-foreground hover:text-red-500"
                title="删除"
                @click="removeRule(rule._index)"
              >
                ×
              </button>
            </div>
          </div>
          <div v-else class="text-[11px] text-muted-foreground/70">暂无自定义规则</div>
        </div>
      </div>

      <!-- 输出优化配置 -->
      <div
        class="rounded-lg border border-blue-200/60 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20"
      >
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] font-medium text-blue-700 dark:text-blue-300"
              >输出优化</span
            >
            <span class="text-[11px] text-muted-foreground"
              >脱敏后对回复进行 LLM 二次优化</span
            >
          </div>
          <a-switch
            v-model:checked="form.outputOptimizationEnabled"
            size="small"
          />
        </div>
        <a-textarea
          v-if="form.outputOptimizationEnabled"
          v-model:value="form.outputOptimizationInstructions"
          :rows="2"
          placeholder="优化指令，如：将回复调整为更正式的商务语气；或：将列表数据格式化为 Markdown 表格"
          class="text-[12px]"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">模型</label>
          <a-select v-model:value="form.modelId" class="w-full" :options="modelOptions" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">调用策略</label>
          <a-select
            v-model:value="form.strategy"
            class="w-full"
            :options="strategyOptions"
          />
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">温度</label>
          <a-input-number v-model:value="form.temperature" :min="0" :max="2" :step="0.1" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">Max Tokens</label>
          <a-input-number v-model:value="form.maxTokens" :min="1024" :max="32768" :step="1024" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">最大迭代</label>
          <a-input-number v-model:value="form.maxIterations" :min="1" :max="20" class="w-full" />
        </div>
      </div>

      <!-- MCP 服务器绑定 -->
      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          MCP 服务器
          <span class="ml-1 text-[10px] text-muted-foreground/60">选择允许该 Agent 调用的 MCP 工具服务器</span>
        </label>
        <a-select
          v-model:value="form.allowedMcpServers"
          mode="multiple"
          :options="mcpServerOptions"
          placeholder="不选则该 Agent 无法调用 MCP 工具"
          :allow-clear="true"
          class="w-full"
        />
      </div>

      <!-- 知识库绑定（RAG）：回答时对这些知识库做向量检索增强 -->
      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          知识库
          <span class="ml-1 text-[10px] text-muted-foreground/60">选择回答时检索增强的知识库（RAG）</span>
        </label>
        <a-select
          v-model:value="form.allowedKnowledgeBases"
          mode="multiple"
          :options="kbOptions"
          placeholder="不选则该 Agent 回答不使用知识库"
          :allow-clear="true"
          class="w-full"
        />
      </div>

      <!-- P2-T6：数据源绑定（null=全局不限定；清空全部=显式禁用 db 源） -->
      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          数据源
          <span class="ml-1 text-[10px] text-muted-foreground/60">Agent 可查询的 NL2SQL 数据源；不选 = 全局不限定</span>
        </label>
        <a-select
          :value="form.allowedDatasources ?? undefined"
          mode="multiple"
          :options="dsOptions"
          placeholder="不选则不限定（可查全部启用中数据源）"
          :allow-clear="true"
          class="w-full"
          @change="(v: any) => (form.allowedDatasources = (v as string[]) ?? null)"
        />
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">主题色</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in colorOptions"
            :key="c.value"
            type="button"
            class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
            :style="{
              backgroundColor: c.value,
              borderColor: form.color === c.value ? '#fff' : 'transparent',
              boxShadow: form.color === c.value ? `0 0 0 2px ${c.value}` : 'none',
            }"
            :title="c.label"
            @click="form.color = c.value"
          />
        </div>
      </div>
    </div>
  </a-modal>
</template>