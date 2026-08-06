<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message } from 'ant-design-vue';

import { onMounted, ref } from 'vue';

import type { Provider } from '../types';

import { modelTypeText, providerStatusMap } from '../constants';
import {
  listProviders,
  saveProvider,
  testProviderConnection,
  toggleProviderEnabled,
} from '../api/provider';
import { useBackendHealth } from '../composables/use-backend-health';

import ProviderForm from './provider-form.vue';

defineOptions({ name: 'AiProviderCompact' });

const ZapIcon = createIconifyIcon('lucide:zap');
const ServerIcon = createIconifyIcon('lucide:server');
const PlusIcon = createIconifyIcon('lucide:plus');

const providers = ref<Provider[]>([]);
const loading = ref(false);
const testing = ref<string>('');
const formOpen = ref(false);
const editingData = ref<Provider | null>(null);

const health = useBackendHealth();

async function loadProviders() {
  loading.value = true;
  try {
    providers.value = await listProviders();
  } catch {
    providers.value = [];
  } finally {
    loading.value = false;
  }
}

async function testConnection(p: Provider) {
  testing.value = p.id;
  try {
    const updated = await testProviderConnection(p.id);
    const target = providers.value.find((x) => x.id === p.id);
    if (target) {
      target.status = updated.status ?? (updated ? 'active' : 'error');
      target.models = updated.models ?? target.models;
    }
  } catch {
    message.error(`${p.name} 连接测试失败`);
  } finally {
    testing.value = '';
  }
}

async function toggle(p: Provider) {
  if (p.isBuiltin) return;
  const next = !p.enabled;
  try {
    await toggleProviderEnabled(p.id, next);
    p.enabled = next;
    if (!next) p.status = 'inactive';
  } catch {
    message.error('切换失败');
  }
}

function handleAdd() {
  editingData.value = null;
  formOpen.value = true;
}

async function handleSubmit(data: Partial<Provider>) {
  try {
    const id = await saveProvider({
      name: data.name ?? '未命名',
      type: data.type ?? 'custom',
      baseUrl: data.baseUrl ?? '',
      apiKey: data.apiKeyMasked,
      enabled: data.enabled ?? true,
      isBuiltin: false,
    });
    const newProvider: Provider = {
      id,
      name: data.name ?? '未命名',
      type: data.type ?? 'custom',
      baseUrl: data.baseUrl ?? '',
      apiKeyMasked: data.apiKeyMasked ?? '—',
      status: 'inactive',
      enabled: data.enabled ?? true,
      isBuiltin: false,
      models: data.models ?? [],
      createdAt: Date.now(),
    };
    providers.value.unshift(newProvider);
    message.success(`供应商 ${newProvider.name} 已创建`);
  } catch {
    message.error('创建失败');
  }
}

/** 按模型类型分组统计（用于卡片展示模型类型分布） */
function modelTypeGroups(p: Provider): Array<{ type: string; count: number }> {
  const counter = new Map<string, number>();
  (p.models ?? []).forEach((m) => {
    const t = m.modelType ?? 'chat';
    counter.set(t, (counter.get(t) ?? 0) + 1);
  });
  return Array.from(counter.entries()).map(([type, count]) => ({ type, count }));
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadProviders();
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">供应商管理</span>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
        @click="handleAdd"
      >
        <component :is="PlusIcon" class="h-3 w-3" />
        新建
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-3">
      <div
        v-if="health.state === 'disconnected'"
        class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
      >
        <div class="text-2xl">⚠</div>
        <div>后端未连接，无法加载供应商列表</div>
        <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="p in providers"
          :key="p.id"
          class="rounded-lg border border-border bg-card p-3"
        >
          <div class="flex items-center gap-2">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <component :is="ServerIcon" class="h-4 w-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-[13px] font-medium">{{ p.name }}</span>
                <span
                  v-if="p.isBuiltin"
                  class="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground"
                >
                  内置
                </span>
              </div>
              <div class="truncate text-[11px] text-muted-foreground">
                {{ p.baseUrl }}
              </div>
            </div>
            <button
              :disabled="p.isBuiltin"
              class="relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              :class="p.enabled ? 'bg-primary' : 'bg-muted'"
              @click="toggle(p)"
            >
              <span
                class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                :class="p.enabled ? 'left-[18px]' : 'left-0.5'"
              />
            </button>
          </div>

          <div class="mt-2 flex items-center justify-between pl-10">
            <div class="flex flex-wrap items-center gap-1 text-[11px]">
              <span
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
                :class="{
                  'bg-emerald-500/10 text-emerald-600':
                    p.status === 'active',
                  'bg-muted text-muted-foreground': p.status === 'inactive',
                  'bg-red-500/10 text-red-500': p.status === 'error',
                }"
              >
                {{ providerStatusMap[p.status]?.text }}
              </span>
              <span class="text-muted-foreground">{{ p.models.length }} 模型</span>
              <span
                v-for="g in modelTypeGroups(p)"
                :key="g.type"
                class="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary"
                :title="`${modelTypeText[g.type] ?? g.type} 模型 ${g.count} 个`"
              >
                {{ modelTypeText[g.type] ?? g.type }}
                <span class="font-semibold">{{ g.count }}</span>
              </span>
            </div>
            <button
              class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              :disabled="testing === p.id"
              @click="testConnection(p)"
            >
              <component
                :is="ZapIcon"
                class="h-3 w-3"
                :class="testing === p.id ? 'animate-pulse' : ''"
              />
              {{ testing === p.id ? '测试中…' : '测试连接' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ProviderForm v-model:open="formOpen" :data="editingData" @submit="handleSubmit" />
  </div>
</template>