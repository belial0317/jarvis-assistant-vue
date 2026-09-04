<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  getAiApiKey,
  getAiBaseUrl,
  maskAiApiKey,
  resetAiApiKey,
  resetAiBaseUrl,
  setAiApiKey,
  setAiBaseUrl,
} from '../api/client';
import {
  checkBackendHealth,
  useBackendHealth,
} from '../composables/use-backend-health';
import { listProviders } from '../api/provider';
import { useAiAssistantConfig } from '../providers/inject';
import type { AiAssistantConfig } from '../providers/config';

/**
 * 宿主/门户配置（组件树内由 AiAssistant provide；兜底空对象防越级使用报错）
 * - settings.serviceUrlVisible / apiKeyVisible：管理端字段可见性开关（缺省可见）
 * - syncParams.defaultModel：管理端下发的默认模型（挂载时覆盖本地默认值）
 */
const hostConfig: AiAssistantConfig = (() => {
  try {
    return useAiAssistantConfig();
  } catch {
    return {} as AiAssistantConfig;
  }
})();

/** 「服务地址」字段可见性（false = 管理端锁定，不可查看/编辑） */
const showServiceUrl = hostConfig.settings?.serviceUrlVisible !== false;
/** 「API Key」字段可见性 */
const showApiKeyField = hostConfig.settings?.apiKeyVisible !== false;

defineOptions({ name: 'AiSettings' });

const PaletteIcon = createIconifyIcon('lucide:palette');
const MessageIcon = createIconifyIcon('lucide:message-square');
const BellIcon = createIconifyIcon('lucide:bell');
const KeyboardIcon = createIconifyIcon('lucide:keyboard');
const TrashIcon = createIconifyIcon('lucide:trash-2');
const ServerIcon = createIconifyIcon('lucide:server');

const settings = reactive({
  theme: 'system' as 'system' | 'light' | 'dark',
  fontSize: 13,
  defaultModel: '',
  streamSpeed: 'normal' as 'slow' | 'normal' | 'fast',
  enterToSend: true,
  showReasoning: true,
  taskCompleteNotify: true,
  errorPopup: true,
  shortcutOpen: 'Cmd+K',
  shortcutNewChat: 'Cmd+N',
  shortcutStop: 'Cmd+.',
});

// ===== 默认模型：服务端驱动，禁止写死 =====
// 选项来源优先级：控制台系统设置模型列表（config.models）> 供应商模型目录（/providers）。
// 选中值优先级：控制台默认模型（syncParams.defaultModel）> 列表首位。
const modelOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadModelOptions() {
  const consoleModels = (hostConfig.models ?? [])
      .map((m) => m.trim())
      .filter(Boolean);
  if (consoleModels.length > 0) {
    modelOptions.value = consoleModels.map((m) => ({ label: m, value: m }));
  } else {
    try {
      const providers = await listProviders({ enabled: true });
      modelOptions.value = providers.flatMap((p) =>
          (p.models ?? []).map((m) => ({ label: m.displayName, value: m.name })),
      );
    } catch {
      // 目录加载失败：留空下拉（不伪造模型项）
      modelOptions.value = [];
    }
  }
  // 选中值：控制台默认模型优先，其次列表首位
  if (modelOptions.value.length > 0) {
    const hit = modelOptions.value.find((m) => m.value === settings.defaultModel);
    if (!hit) {
      settings.defaultModel = modelOptions.value[0]!.value;
    }
  }
}

// ===== 后端服务地址配置 =====
const DEFAULT_BASE_URL = '/ai-api';
const backendUrlInput = ref('');
const testing = ref(false);
/**
 * 本地显示状态由 useBackendHealth().state 派生：
 * - 共享单一来源，避免与抽屉顶部 banner 状态不一致
 */
const health = useBackendHealth();

const backendStatus = computed<'idle' | 'ok' | 'error'>(() => {
  if (health.value.state === 'connected') return 'ok';
  if (health.value.state === 'disconnected') return 'error';
  return 'idle';
});

function loadBackendUrl() {
  backendUrlInput.value = getAiBaseUrl();
  loadApiKey();
}

// ===== API Key 配置 =====
const apiKeyInput = ref('');
/** 已配置 key 的脱敏展示（响应式：保存/清除后刷新） */
const savedApiKeyMasked = ref('');
/** 明文查看开关：默认密文，点眼睛图标切换 */
const apiKeyVisible = ref(false);
const EyeIcon = createIconifyIcon('lucide:eye');
const EyeOffIcon = createIconifyIcon('lucide:eye-off');

function loadApiKey() {
  const saved = getAiApiKey();
  savedApiKeyMasked.value = saved ? maskAiApiKey(saved) : '';
  // 已配置时输入框回填完整 key（密文呈现），可点眼睛查看明文；未配置则留空待输入
  apiKeyInput.value = saved ?? '';
  apiKeyVisible.value = false;
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    message.error('请输入 API Key（sk-jarvis- 开头，由门户平台分配）');
    return;
  }
  setAiApiKey(key);
  loadApiKey();
  message.success(`API Key 已保存：${maskAiApiKey(key)}`);
}

function handleClearApiKey() {
  resetAiApiKey();
  loadApiKey();
  message.success('已清除本地 API Key（回落到宿主默认凭据）');
}

/**
 * 保存后端地址：
 * 1. 写入 localStorage
 * 2. 失效 health 缓存
 * 3. 主动发一次 ping（让用户立即看到结果）
 * 4. 触发全局事件，让 ai-assistant-content 的横幅自动刷新
 */
async function saveBackendUrl() {
  const url = backendUrlInput.value.trim();
  setAiBaseUrl(url);
  backendUrlInput.value = getAiBaseUrl();
  message.success(
    url && url !== DEFAULT_BASE_URL
      ? `后端服务地址已切换为：${url}`
      : '已恢复默认后端服务地址（/ai-api）',
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ai-base-url-changed'));
  }
  await checkBackendHealth(true);
}

async function handleResetBackendUrl() {
  resetAiBaseUrl();
  backendUrlInput.value = DEFAULT_BASE_URL;
  message.success('已恢复默认后端服务地址（/ai-api）');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ai-base-url-changed'));
  }
  await checkBackendHealth(true);
}

async function testBackendConnection() {
  testing.value = true;
  try {
    await checkBackendHealth(true);
    if (health.value.state === 'connected') {
      message.success(
        `连接成功（${health.value.service ?? 'AI 后端'}，${health.value.latencyMs ?? 0}ms）`,
      );
    } else {
      message.error('连接失败，请检查地址或后端服务状态');
    }
  } catch {
    message.error('连接失败，请检查地址或后端服务状态');
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  loadBackendUrl();
  void loadModelOptions();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">设置</span>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-3">
      <!-- 当前连接状态总览（第一屏即看到） -->
      <div
        class="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
        :class="
          backendStatus === 'ok'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
            : backendStatus === 'error'
              ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
        "
      >
        <span class="text-base">
          {{ backendStatus === 'ok' ? '✓' : backendStatus === 'error' ? '⚠' : '⋯' }}
        </span>
        <span class="font-medium">
          {{ backendStatus === 'ok'
            ? '后端服务已连通'
            : backendStatus === 'error'
              ? '后端服务未连通'
              : '正在检测后端…' }}
        </span>
        <span v-if="health.latencyMs !== undefined && backendStatus === 'ok'" class="opacity-70">
          · {{ health.latencyMs }}ms
        </span>
        <span class="ml-auto text-[11px] opacity-70">
          <code class="rounded bg-muted/40 px-1 text-[10px]">{{ getAiBaseUrl() }}</code>
        </span>
      </div>

      <!-- 后端服务 -->
      <div class="mb-4" data-ai-anchor="backend-service">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <component :is="ServerIcon" class="h-3.5 w-3.5" />
          后端服务
        </div>
        <div class="space-y-2 rounded-lg border border-border bg-card p-3">
          <template v-if="showServiceUrl">
            <div>
              <label class="mb-1 block text-[11px] text-muted-foreground">
                服务地址
                <span class="text-muted-foreground/70">
                  （留空或 <code class="rounded bg-muted px-1 text-[10px]">/ai-api</code> 走默认代理）
                </span>
              </label>
              <div class="flex items-center gap-1.5">
                <input
                  v-model="backendUrlInput"
                  type="text"
                  class="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                  placeholder="/ai-api 或 http://192.168.1.100:8080"
                />
                <button
                  class="h-7 flex-shrink-0 rounded-md bg-primary px-2.5 text-[11px] text-primary-foreground hover:bg-primary/90"
                  @click="saveBackendUrl"
                >
                  保存
                </button>
                <button
                  class="h-7 flex-shrink-0 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent"
                  title="恢复默认 /ai-api"
                  @click="handleResetBackendUrl"
                >
                  重置
                </button>
              </div>
            </div>
          </template>
          <div :class="showServiceUrl ? 'mt-1.5' : ''" class="flex items-center gap-2">
              <button
                class="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                :disabled="testing"
                @click="testBackendConnection"
              >
                <component
                  :is="ServerIcon"
                  class="h-3 w-3"
                  :class="testing ? 'animate-pulse' : ''"
                />
                {{ testing ? '测试中…' : '测试连接' }}
              </button>
              <span
                v-if="backendStatus === 'ok'"
                class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-600"
              >
                ● 连接正常<template v-if="health.latencyMs !== undefined">（{{ health.latencyMs }}ms）</template>
              </span>
              <span
                v-else-if="backendStatus === 'error'"
                class="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-500"
              >
                ● 连接失败
              </span>
              <span v-else class="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-600">
                ● 检测中…
              </span>
              <span
                v-if="showServiceUrl"
                class="text-[11px] text-muted-foreground"
              >
                当前：<code class="rounded bg-muted px-1 text-[10px]">{{ getAiBaseUrl() }}</code>
              </span>
          </div>
          <div class="border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            <div>· 默认 <code class="rounded bg-muted px-1 text-[10px]">/ai-api</code>：经 vite proxy / 网关转发到后端</div>
            <div>· 自定义地址（如 <code class="rounded bg-muted px-1 text-[10px]">http://host:port</code>）：直连后端，绕过代理</div>
            <div>· 切换后所有 AI 请求（含流式 SSE）立即生效，无需刷新</div>
          </div>

          <!-- API Key 配置（管理端可通过 settings.apiKeyVisible=false 锁定隐藏） -->
          <div v-if="showApiKeyField" class="border-t border-border pt-2">
            <label class="mb-1 block text-[11px] text-muted-foreground">
              API Key
              <span v-if="!savedApiKeyMasked" class="ml-1 text-amber-600">未配置（使用宿主默认凭据）</span>
            </label>
            <div class="flex items-center gap-1.5">
              <input
                v-model="apiKeyInput"
                :type="apiKeyVisible ? 'text' : 'password'"
                autocomplete="off"
                class="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                :placeholder="savedApiKeyMasked ? '已配置（点击右侧眼睛图标查看）' : '输入 sk-jarvis- 开头的 API Key'"
              />
              <button
                v-if="savedApiKeyMasked"
                class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                :title="apiKeyVisible ? '隐藏明文' : '查看明文'"
                @click="apiKeyVisible = !apiKeyVisible"
              >
                <component :is="apiKeyVisible ? EyeOffIcon : EyeIcon" class="h-3.5 w-3.5" />
              </button>
              <button
                class="h-7 flex-shrink-0 rounded-md bg-primary px-2.5 text-[11px] text-primary-foreground hover:bg-primary/90"
                @click="saveApiKey"
              >
                保存
              </button>
              <button
                v-if="savedApiKeyMasked"
                class="h-7 flex-shrink-0 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground hover:bg-accent"
                title="清除本地保存的 API Key"
                @click="handleClearApiKey"
              >
                清除
              </button>
            </div>
            <div class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              · Key 仅保存在本浏览器（localStorage），不会上传；由门户运营平台分配
              <template v-if="savedApiKeyMasked">
                <br />· 修改后点"保存"覆盖；输入框默认密文呈现，点眼睛图标查看明文
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 外观 -->
      <div class="mb-4">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <component :is="PaletteIcon" class="h-3.5 w-3.5" />
          外观
        </div>
        <div class="space-y-2 rounded-lg border border-border bg-card p-3">
          <div class="flex items-center justify-between">
            <span class="text-[12px]">主题</span>
            <select
              v-model="settings.theme"
              class="h-7 cursor-pointer rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            >
              <option value="system">跟随系统</option>
              <option value="light">亮色</option>
              <option value="dark">暗色</option>
            </select>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[12px]">字体大小</span>
            <div class="flex items-center gap-2">
              <input
                v-model.number="settings.fontSize"
                type="range"
                min="11"
                max="16"
                class="w-24 accent-primary"
              />
              <span class="w-8 text-[11px] text-muted-foreground">{{ settings.fontSize }}px</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 对话 -->
      <div class="mb-4">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <component :is="MessageIcon" class="h-3.5 w-3.5" />
          对话
        </div>
        <div class="space-y-2 rounded-lg border border-border bg-card p-3">
          <div class="flex items-center justify-between">
            <span class="text-[12px]">默认模型</span>
            <select
              v-model="settings.defaultModel"
              class="h-7 cursor-pointer rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            >
              <option v-for="m in modelOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[12px]">流式速度</span>
            <select
              v-model="settings.streamSpeed"
              class="h-7 cursor-pointer rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
            >
              <option value="slow">慢速</option>
              <option value="normal">正常</option>
              <option value="fast">快速</option>
            </select>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[12px]">Enter 发送（Shift+Enter 换行）</span>
            <button
              class="relative h-4 w-7 rounded-full transition-colors"
              :class="settings.enterToSend ? 'bg-primary' : 'bg-muted'"
              @click="settings.enterToSend = !settings.enterToSend"
            >
              <span
                class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                :class="settings.enterToSend ? 'left-[14px]' : 'left-0.5'"
              />
            </button>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[12px]">显示推理过程</span>
            <button
              class="relative h-4 w-7 rounded-full transition-colors"
              :class="settings.showReasoning ? 'bg-primary' : 'bg-muted'"
              @click="settings.showReasoning = !settings.showReasoning"
            >
              <span
                class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                :class="settings.showReasoning ? 'left-[14px]' : 'left-0.5'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 通知 -->
      <div class="mb-4">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <component :is="BellIcon" class="h-3.5 w-3.5" />
          通知
        </div>
        <div class="space-y-2 rounded-lg border border-border bg-card p-3">
          <div class="flex items-center justify-between">
            <span class="text-[12px]">任务完成提醒</span>
            <button
              class="relative h-4 w-7 rounded-full transition-colors"
              :class="settings.taskCompleteNotify ? 'bg-primary' : 'bg-muted'"
              @click="settings.taskCompleteNotify = !settings.taskCompleteNotify"
            >
              <span
                class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                :class="settings.taskCompleteNotify ? 'left-[14px]' : 'left-0.5'"
              />
            </button>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[12px]">错误弹窗</span>
            <button
              class="relative h-4 w-7 rounded-full transition-colors"
              :class="settings.errorPopup ? 'bg-primary' : 'bg-muted'"
              @click="settings.errorPopup = !settings.errorPopup"
            >
              <span
                class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
                :class="settings.errorPopup ? 'left-[14px]' : 'left-0.5'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 快捷键 -->
      <div class="mb-4">
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <component :is="KeyboardIcon" class="h-3.5 w-3.5" />
          快捷键
        </div>
        <div class="space-y-1.5 rounded-lg border border-border bg-card p-3">
          <div class="flex items-center justify-between text-[12px]">
            <span>打开 AI 助手</span>
            <kbd class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{{ settings.shortcutOpen }}</kbd>
          </div>
          <div class="flex items-center justify-between text-[12px]">
            <span>新建会话</span>
            <kbd class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{{ settings.shortcutNewChat }}</kbd>
          </div>
          <div class="flex items-center justify-between text-[12px]">
            <span>停止生成</span>
            <kbd class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{{ settings.shortcutStop }}</kbd>
          </div>
        </div>
      </div>

      <!-- 数据 -->
      <div>
        <div class="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <component :is="TrashIcon" class="h-3.5 w-3.5" />
          数据
        </div>
        <div class="rounded-lg border border-border bg-card p-3">
          <button
            class="w-full rounded-md border border-red-500/30 bg-red-500/5 py-1.5 text-[12px] text-red-500 hover:bg-red-500/10"
          >
            清空所有会话历史
          </button>
        </div>
      </div>
    </div>
  </div>
</template>