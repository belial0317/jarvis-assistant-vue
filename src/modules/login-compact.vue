<script lang="ts" setup>
/**
 * 组件内置登录卡片（tasks-2610-0212-46）
 *
 * 显示条件：抽屉内无任何可用凭据（宿主 auth / 宿主下发 Key / 组件登录用户 / 本地 Key）。
 * 三种方式对齐控制台：账号密码 / 短信验证码 / API Key（微信扫码属门户场景，卡片内引导）。
 * 「后端接口地址」为登录前置项：提交前先 setAiBaseUrl 落地，再向该地址发起登录请求。
 */
import { computed, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';

import {
  loginByUsername,
  loginBySmsCode,
  sendSmsCode,
  validateApiKeyOnBackend,
  type LoginResult,
} from '../api/auth';
import { getAiBaseUrl, maskAiApiKey, setAiApiKey, setAiBaseUrl } from '../api/client';

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

// ===== 账号登录 =====
const username = ref('');
const password = ref('');
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
  <div class="flex h-full items-center justify-center overflow-y-auto bg-background p-4">
    <div class="w-full max-w-[360px] rounded-lg border border-border bg-card p-5">
      <div class="mb-4 flex items-center gap-2">
        <div
          class="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-medium text-primary-foreground"
        >
          AI
        </div>
        <span class="text-[14px] font-medium">登录 AI 助手</span>
      </div>

      <!-- 后端接口对接地址（登录前置项） -->
      <div class="mb-3">
        <button
          type="button"
          class="text-[12px] text-muted-foreground hover:text-foreground"
          @click="showAdvanced = !showAdvanced"
        >
          后端接口地址 {{ showAdvanced ? '▲' : '▼' }}
        </button>
        <input
          v-if="showAdvanced"
          v-model="baseUrlInput"
          type="text"
          placeholder="如 /ai-api 或 http://host:8081"
          class="mt-1.5 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
          data-testid="login-base-url"
        />
      </div>

      <!-- 登录方式 Tab -->
      <div class="mb-3 flex gap-4 border-b border-border text-[13px]">
        <button
          type="button"
          class="pb-2"
          :class="tab === 'account' ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted-foreground'"
          @click="tab = 'account'"
        >
          账号登录
        </button>
        <button
          type="button"
          class="pb-2"
          :class="tab === 'sms' ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted-foreground'"
          @click="tab = 'sms'"
        >
          验证码登录
        </button>
        <button
          type="button"
          class="pb-2"
          :class="tab === 'apikey' ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted-foreground'"
          @click="tab = 'apikey'"
        >
          API Key
        </button>
      </div>

      <!-- 账号登录 -->
      <form v-if="tab === 'account'" class="space-y-2.5" @submit.prevent="handleAccountLogin">
        <input
          v-model="username"
          type="text"
          placeholder="用户名"
          class="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <input
          v-model="password"
          type="password"
          placeholder="密码"
          class="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <button
          type="submit"
          :disabled="accountLoading"
          class="h-9 w-full rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {{ accountLoading ? '登录中…' : '登 录' }}
        </button>
      </form>

      <!-- 验证码登录 -->
      <form v-else-if="tab === 'sms'" class="space-y-2.5" @submit.prevent="handleSmsLogin">
        <input
          v-model="phone"
          type="tel"
          maxlength="11"
          placeholder="手机号"
          class="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <div class="flex gap-2">
          <input
            v-model="smsCode"
            type="text"
            maxlength="6"
            placeholder="验证码"
            class="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
          />
          <button
            type="button"
            :disabled="smsSending || smsCountdown > 0 || !phoneValid"
            class="h-9 flex-shrink-0 rounded-md border border-border px-3 text-[12px] hover:bg-accent disabled:opacity-50"
            @click="handleSendSms"
          >
            {{ smsCountdown > 0 ? `${smsCountdown}s 后重发` : '发送验证码' }}
          </button>
        </div>
        <button
          type="submit"
          :disabled="smsLoading"
          class="h-9 w-full rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {{ smsLoading ? '登录中…' : '登 录' }}
        </button>
      </form>

      <!-- API Key 登录 -->
      <form v-else class="space-y-2.5" @submit.prevent="handleApiKeyLogin">
        <input
          v-model="apiKeyInput"
          type="password"
          placeholder="sk- 开头的 API Key"
          class="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <p class="text-[11px] text-muted-foreground">
          由门户控制台「API Key 管理」创建；此方式仅本浏览器生效，不含用户身份。
        </p>
        <button
          type="submit"
          :disabled="apiKeyLoading"
          class="h-9 w-full rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {{ apiKeyLoading ? '校验中…' : '验证并进入' }}
        </button>
      </form>

      <p class="mt-4 text-center text-[11px] text-muted-foreground">
        微信扫码登录请前往门户控制台
      </p>
    </div>
  </div>
</template>
