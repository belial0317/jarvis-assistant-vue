<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { message, Input as AInput, Modal as AModal, Switch as ASwitch } from 'ant-design-vue';

import { onMounted, reactive, ref } from 'vue';

import type { Provider, ProviderModel } from '../types';

import { modelTypeText, providerStatusMap } from '../constants';
import { fetchModelCatalog } from '../api/chat';
import { deleteProvider, deleteProviderModel, saveProviderModel } from '../api/provider';
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
      id: data.id,
      name: data.name?.trim() || '未命名',
      type: data.type ?? 'openai-compatible',
      baseUrl: data.baseUrl ?? '',
      // 修复（tasks-2609-1400-10）：读明文 apiKey（此前误读掩码串，Key 无法落库）
      apiKey: data.apiKey ?? '',
      enabled: data.enabled ?? true,
      isBuiltin: false,
    });
    // 模型持久化（此前创建后模型丢失）
    for (const m of data.models ?? []) {
      if (!m.name?.trim()) continue;
      try {
        await saveProviderModel(id, {
          name: m.name.trim(),
          displayName: m.displayName || m.name,
          modelType: m.modelType,
          isDefault: m.isDefault,
        });
      } catch {
        message.warning(`模型 ${m.name} 保存失败，可稍后在模型管理补录`);
      }
    }
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
    if (data.id) {
      // 编辑：刷新列表拿服务端状态（掩码/模型同步）
      message.success(`供应商 ${newProvider.name} 已保存`);
      await loadProviders();
      return;
    }
    providers.value.unshift(newProvider);
    message.success(`供应商 ${newProvider.name} 已创建`);
  } catch {
    message.error('创建失败');
  }
}

// ===== tasks-2609-1400-10 增量：私有模型编辑/删除（官方模型只读） =====
const modelEditOpen = ref(false);
const modelSaving = ref(false);
const modelEditProvider = ref<Provider | null>(null);
const modelEditForm = reactive({ id: '', name: '', displayName: '', isDefault: false });

/** 私有供应商（列表已按本人过滤）可管理模型；官方（内置）模型只读 */
function canManageModels(p: { isBuiltin?: boolean }): boolean {
  return !p.isBuiltin;
}

function openProviderEdit(p: Provider) {
  editingData.value = p;
  formOpen.value = true;
}

function confirmProviderDelete(p: Provider) {
  AModal.confirm({
    title: '删除供应商',
    content: `确认删除「${p.name}」？其模型目录将一并删除。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await deleteProvider(p.id);
      message.success('供应商已删除');
      await loadProviders();
    },
  });
}

function openModelEdit(p: Provider, m: ProviderModel) {
  modelEditProvider.value = p;
  modelEditForm.id = m.id;
  modelEditForm.name = m.name;
  modelEditForm.displayName = m.displayName || m.name;
  modelEditForm.isDefault = !!m.isDefault;
  modelEditOpen.value = true;
}

async function saveModelEdit() {
  const pid = modelEditProvider.value?.id;
  if (!pid || modelSaving.value) return;
  if (!modelEditForm.name.trim() || !modelEditForm.displayName.trim()) {
    message.warning('模型标识与显示名必填');
    return;
  }
  modelSaving.value = true;
  try {
    await saveProviderModel(pid, {
      id: modelEditForm.id || undefined,
      name: modelEditForm.name.trim(),
      displayName: modelEditForm.displayName.trim(),
      modelType: 'chat',
      isDefault: modelEditForm.isDefault,
    });
    message.success('模型已保存');
    modelEditOpen.value = false;
    await loadProviders();
  } catch {
    message.error('保存失败');
  } finally {
    modelSaving.value = false;
  }
}

function confirmModelDelete(p: Provider, m: ProviderModel) {
  AModal.confirm({
    title: '删除模型',
    content: `确认删除「${m.displayName || m.name}」？删除后使用它的会话将回落默认模型。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      await deleteProviderModel(m.id);
      message.success('已删除');
      await loadProviders();
    },
  });
}

/** tasks-2609-1400-10：套餐内官方模型名集合（目录 builtin 供应商的模型） */
const planModelNames = new Set<string>();

async function loadPlanModels() {
  try {
    const catalog = await fetchModelCatalog();
    planModelNames.clear();
    for (const pv of catalog.providers ?? []) {
      if (!pv.builtin) continue;
      for (const m of pv.models ?? []) planModelNames.add(m.name);
    }
  } catch {
    planModelNames.clear();
  }
}

function isInPlan(
  p: { isBuiltin?: boolean },
  m: { name?: string; id?: string },
): boolean {
  if (p.isBuiltin) return planModelNames.has(m.name ?? '');
  // 私有供应商模型不属于套餐，标识为非套餐
  return false;
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
  void loadPlanModels();
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
                {{ p.isBuiltin ? '平台内置' : p.baseUrl }}
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

          <div class="mt-2 pl-10">
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
            </div>
            <!-- tasks-2609-1400-10：逐模型芯片；套餐内模型带「套餐」徽标 -->
            <div
              v-if="modelTypeGroups(p).length"
              class="mt-1.5 flex flex-wrap gap-1"
            >
              <span
                v-for="m in p.models"
                :key="m.id"
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
                :class="
                  isInPlan(p, m)
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                "
                :title="
                  isInPlan(p, m)
                    ? '当前套餐内模型，可直接对话'
                    : '不在当前套餐内，对话路由将回落/被拦'
                "
              >
                {{ m.displayName || m.name }}
                <span
                  v-if="isInPlan(p, m)"
                  class="rounded-sm bg-primary px-1 text-[9px] font-semibold text-white"
                >
                  套餐
                </span>
                <template v-if="canManageModels(p)">
                  <button
                    class="ml-0.5 rounded px-0.5 text-[10px] opacity-50 hover:bg-accent hover:opacity-100"
                    :title="'编辑模型'"
                    @click.stop="openModelEdit(p, m)"
                  >
                    ✎
                  </button>
                  <button
                    class="rounded px-0.5 text-[10px] opacity-50 hover:bg-red-500/10 hover:text-red-500 hover:opacity-100"
                    :title="'删除模型'"
                    @click.stop="confirmModelDelete(p, m)"
                  >
                    ✕
                  </button>
                </template>
              </span>
            </div>
            <div class="mt-1.5 flex items-center justify-end gap-1">
              <template v-if="canManageModels(p)">
                <button
                  class="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  @click="openProviderEdit(p)"
                >
                  编辑
                </button>
                <button
                  class="rounded px-2 py-1 text-[11px] text-red-500/80 hover:bg-red-500/10 hover:text-red-500"
                  @click="confirmProviderDelete(p)"
                >
                  删除
                </button>
              </template>
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
    </div>

    <!-- tasks-2609-1400-10：私有模型编辑对话框 -->
    <AModal
      v-model:open="modelEditOpen"
      title="编辑模型"
      :confirm-loading="modelSaving"
      ok-text="保存"
      cancel-text="取消"
      @ok="saveModelEdit"
    >
      <div class="space-y-3 py-2">
        <div>
          <p class="mb-1 text-[12px] text-muted-foreground">显示名</p>
          <AInput v-model:value="modelEditForm.displayName" placeholder="DeepSeek-V4-Flash" />
        </div>
        <div>
          <p class="mb-1 text-[12px] text-muted-foreground">模型标识（发送给上游的 model 参数）</p>
          <AInput v-model:value="modelEditForm.name" placeholder="deepseek-v4-flash" />
        </div>
        <label class="flex items-center gap-2 text-[12px]">
          <ASwitch v-model:checked="modelEditForm.isDefault" size="small" />
          设为目录默认模型
        </label>
      </div>
    </AModal>

    <ProviderForm v-model:open="formOpen" :data="editingData" @submit="handleSubmit" />
  </div>
</template>