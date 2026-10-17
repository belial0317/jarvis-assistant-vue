<script lang="ts" setup>
/**
 * 组件内置登录卡片（tasks-2610-0212-46；UI 重设计 2026-10-07）
 *
 * 显示条件：抽屉内无任何可用凭据（宿主 auth / 宿主下发 Key / 组件登录用户 / 本地 Key）。
 * 三种方式对齐控制台：账号密码 / 短信验证码 / API Key（微信扫码属门户场景，卡片内引导）。
 * 「后端接口地址」为登录前置项：提交前先 setAiBaseUrl 落地，再向该地址发起登录请求。
 */
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';

import { createIconifyIcon } from '../providers/icons';
import {
  loginByUsername,
  loginBySmsCode,
  sendSmsCode,
  validateApiKeyOnBackend,
  type LoginResult,
} from '../api/auth';
import { getAiBaseUrl, maskAiApiKey, setAiApiKey, setAiBaseUrl } from '../api/client';

const SparklesIcon = createIconifyIcon('lucide:sparkles');
const UserIcon = createIconifyIcon('lucide:user');
const LockIcon = createIconifyIcon('lucide:lock');
const SmartphoneIcon = createIconifyIcon('lucide:smartphone');
const ShieldCheckIcon = createIconifyIcon('lucide:shield-check');
const KeyRoundIcon = createIconifyIcon('lucide:key-round');
const ServerIcon = createIconifyIcon('lucide:server');
const EyeIcon = createIconifyIcon('lucide:eye');
const EyeOffIcon = createIconifyIcon('lucide:eye-off');
const ChevronDownIcon = createIconifyIcon('lucide:chevron-down');

const emit = defineEmits<{ (e: 'logged-in', result: LoginResult): void }>();

const DEFAULT_BASE_URL = '/ai-api';
const tab = ref<'account' | 'sms' | 'apikey'>('account');

// ===== 后端接口对接地址（登录前置项；与设置页同一事实源 setAiBaseUrl） =====
const baseUrlInput = ref('');
const showAdvanced = ref(false);

onMounted(() => {
  baseUrlInput.value = getAiBaseUrl();
});

/** 提交前落地地址；返回实际使用的 base */
function applyBaseUrl(): string {
  const url = baseUrlInput.value.trim();
  setAiBaseUrl(url);
  return getAiBaseUrl();
}

const tabs = [
  { key: 'account', label: '账号登录' },
  { key: 'sms', label: '验证码登录' },
  { key: 'apikey', label: 'API Key' },
] as const;

// ===== 账号登录 =====
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const accountLoading = ref(false);

async function handleAccountLogin() {
  if (!username.value.trim() || !password.value) {
    message.error('请输入用户名和密码');
    return;
  }
  accountLoading.value = true;
  try {
    const base = applyBaseUrl();
    const result = await loginByUsername(base, username.value.trim(), password.value);
    onAuthed(result);
  } catch (e) {
    message.error(e instanceof Error ? e.message : '登录失败');
  } finally {
    accountLoading.value = false;
  }
}

// ===== 验证码登录 =====
const phone = ref('');
const smsCode = ref('');
const smsSending = ref(false);
const smsCountdown = ref(0);
let smsTimer: ReturnType<typeof setInterval> | null = null;

const phoneValid = computed(() => /^1\d{10}$/.test(phone.value.trim()));

async function handleSendSms() {
  if (!phoneValid.value) {
    message.error('请输入正确的 11 位手机号');
    return;
  }
  smsSending.value = true;
  try {
    const base = applyBaseUrl();
    await sendSmsCode(base, phone.value.trim());
    message.success('验证码已发送');
    smsCountdown.value = 60;
    smsTimer = setInterval(() => {
      smsCountdown.value -= 1;
      if (smsCountdown.value <= 0 && smsTimer) {
        clearInterval(smsTimer);
        smsTimer = null;
      }
    }, 1000);
  } catch (e) {
    message.error(e instanceof Error ? e.message : '验证码发送失败');
  } finally {
    smsSending.value = false;
  }
}

const smsLoading = ref(false);

async function handleSmsLogin() {
  if (!phoneValid.value) {
    message.error('请输入正确的 11 位手机号');
    return;
  }
  if (!smsCode.value.trim()) {
    message.error('请输入验证码');
    return;
  }
  smsLoading.value = true;
  try {
    const base = applyBaseUrl();
    const result = await loginBySmsCode(base, phone.value.trim(), smsCode.value.trim());
    onAuthed(result);
  } catch (e) {
    message.error(e instanceof Error ? e.message : '登录失败');
  } finally {
    smsLoading.value = false;
  }
}

// ===== API Key 登录 =====
const apiKeyInput = ref('');
const apiKeyLoading = ref(false);
const showApiKey = ref(false);

async function handleApiKeyLogin() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    message.error('请输入 API Key（sk- 开头，由门户控制台分配）');
    return;
  }
  if (key.includes('****')) {
    message.error('检测到粘贴的是脱敏 Key（含 ****），请复制完整 Key');
    return;
  }
  apiKeyLoading.value = true;
  try {
    const base = applyBaseUrl();
    await validateApiKeyOnBackend(base, key);
    setAiApiKey(key);
    message.success(`API Key 已生效：${maskAiApiKey(key)}（仅本浏览器生效）`);
    emit('logged-in', {
      auth: { username: '', accessToken: '', loginAt: Date.now() },
      businessKey: key,
    });
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'API Key 校验未通过');
  } finally {
    apiKeyLoading.value = false;
  }
}

// ===== 登录成功 =====
function onAuthed(result: LoginResult) {
  const name = result.auth.displayName || result.auth.username;
  if (result.businessKey) {
    message.success(`登录成功${name ? `（${name}）` : ''}，已自动绑定 API Key，可以开始对话`);
  } else if (result.auth.accessToken) {
    message.warning(
      '登录成功，但账号名下暂无可用 API Key：请到门户控制台创建后重新登录，或在设置页手填',
    );
  }
  emit('logged-in', result);
}
</script>

<template>
  <div
    class="flex h-full items-center justify-center overflow-y-auto px-4 py-6"
    style="
      background:
        radial-gradient(1200px 400px at 50% -10%, rgba(59, 130, 246, 0.08), transparent),
        var(--background);
    "
  >
    <div
      class="w-full max-w-[380px] rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/5"
    >
      <!-- 品牌区 -->
      <div class="mb-5 flex flex-col items-center text-center">
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl text-primary-foreground shadow-md"
          style="background: linear-gradient(135deg, #3b82f6, #6366f1)"
        >
          <component :is="SparklesIcon" class="h-6 w-6" />
        </div>
        <div class="text-[16px] font-semibold">欢迎使用 AI 助手</div>
        <div class="mt-1 text-[12px] text-muted-foreground">登录后开启智能对话之旅</div>
      </div>

      <!-- 登录方式：分段式切换 -->
      <div class="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          class="rounded-md py-1.5 text-[12px] transition-all"
          :class="
            tab === t.key
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- 账号登录 -->
      <form v-if="tab === 'account'" class="space-y-3" @submit.prevent="handleAccountLogin">
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">用户名</label>
          <div class="relative">
            <component
              :is="UserIcon"
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              class="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary"
            />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">密码</label>
          <div class="relative">
            <component
              :is="LockIcon"
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              class="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-[13px] outline-none transition-colors focus:border-primary"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              @click="showPassword = !showPassword"
            >
              <component :is="showPassword ? EyeOffIcon : EyeIcon" class="h-4 w-4" />
            </button>
          </div>
        </div>
        <button
          type="submit"
          :disabled="accountLoading"
          class="h-10 w-full rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow disabled:opacity-50"
        >
          {{ accountLoading ? '登录中…' : '登 录' }}
        </button>
      </form>

      <!-- 验证码登录 -->
      <form v-else-if="tab === 'sms'" class="space-y-3" @submit.prevent="handleSmsLogin">
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">手机号</label>
          <div class="relative">
            <component
              :is="SmartphoneIcon"
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="phone"
              type="tel"
              maxlength="11"
              placeholder="请输入手机号"
              class="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary"
            />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">验证码</label>
          <div class="flex gap-2">
            <div class="relative min-w-0 flex-1">
              <component
                :is="ShieldCheckIcon"
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                v-model="smsCode"
                type="text"
                maxlength="6"
                placeholder="短信验证码"
                class="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary"
              />
            </div>
            <button
              type="button"
              :disabled="smsSending || smsCountdown > 0 || !phoneValid"
              class="h-10 flex-shrink-0 rounded-lg border border-border px-3 text-[12px] transition-colors hover:bg-accent disabled:opacity-50"
              @click="handleSendSms"
            >
              {{ smsCountdown > 0 ? `${smsCountdown}s 后重发` : '获取验证码' }}
            </button>
          </div>
        </div>
        <button
          type="submit"
          :disabled="smsLoading"
          class="h-10 w-full rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow disabled:opacity-50"
        >
          {{ smsLoading ? '登录中…' : '登 录' }}
        </button>
      </form>

      <!-- API Key 登录 -->
      <form v-else class="space-y-3" @submit.prevent="handleApiKeyLogin">
        <div>
          <label class="mb-1 block text-[11px] text-muted-foreground">API Key</label>
          <div class="relative">
            <component
              :is="KeyRoundIcon"
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="apiKeyInput"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="sk- 开头的 API Key"
              class="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-[13px] outline-none transition-colors focus:border-primary"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              @click="showApiKey = !showApiKey"
            >
              <component :is="showApiKey ? EyeOffIcon : EyeIcon" class="h-4 w-4" />
            </button>
          </div>
          <p class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            由门户控制台「API Key 管理」创建；此方式仅本浏览器生效，不含用户身份。
          </p>
        </div>
        <button
          type="submit"
          :disabled="apiKeyLoading"
          class="h-10 w-full rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow disabled:opacity-50"
        >
          {{ apiKeyLoading ? '校验中…' : '验证并进入' }}
        </button>
      </form>

      <!-- 高级选项：后端接口地址 -->
      <div class="mt-5">
        <button
          type="button"
          class="flex w-full items-center gap-3 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          @click="showAdvanced = !showAdvanced"
        >
          <span class="h-px flex-1 bg-border" />
          <span class="flex items-center gap-1">
            <component :is="ServerIcon" class="h-3 w-3" />
            高级选项
            <component
              :is="ChevronDownIcon"
              class="h-3 w-3 transition-transform"
              :class="showAdvanced ? 'rotate-180' : ''"
            />
          </span>
          <span class="h-px flex-1 bg-border" />
        </button>
        <div v-if="showAdvanced" class="mt-3">
          <label class="mb-1 block text-[11px] text-muted-foreground">后端接口地址</label>
          <input
            v-model="baseUrlInput"
            type="text"
            placeholder="如 /ai-api 或 http://host:8081"
            class="h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] outline-none transition-colors focus:border-primary"
            data-testid="login-base-url"
          />
        </div>
      </div>

      <!-- 底部引导 -->
      <div class="mt-4 text-center text-[11px] text-muted-foreground">
        微信扫码登录请前往
        <span class="text-foreground/80">门户控制台</span>
      </div>
    </div>
  </div>
</template>
