<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import {
  Input as AInput,
  InputPassword as AInputPassword,
  Modal as AModal,
  Select as ASelect,
  Switch as ASwitch,
} from 'ant-design-vue';

import { computed, reactive, watch } from 'vue';

import type { ModelType, Provider, ProviderType } from '../types';

import { modelTypeOptions, providerTypeOptions } from '../constants';

defineOptions({ name: 'AiProviderForm' });

const props = defineProps<{
  open: boolean;
  data?: Provider | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  submit: [data: Partial<Provider>];
}>();

const PlusIcon = createIconifyIcon('lucide:plus');
const TrashIcon = createIconifyIcon('lucide:trash-2');

interface FormState {
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

const defaultState = (): FormState => ({
  name: '',
  type: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  enabled: true,
});

const form = reactive<FormState>(defaultState());
const models = reactive<
  Array<{
    id: string;
    name: string;
    displayName: string;
    modelType: ModelType;
    contextWindow: number;
    isDefault: boolean;
  }>
>([]);

const isEdit = computed(() => !!props.data);
const title = computed(() => (isEdit.value ? '编辑供应商' : '新增供应商'));

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    Object.assign(form, defaultState());
    models.splice(0, models.length);
    if (props.data) {
      form.name = props.data.name;
      form.type = props.data.type;
      form.baseUrl = props.data.baseUrl;
      form.apiKey = '';
      form.enabled = props.data.enabled;
      models.push(
        ...props.data.models.map((m) => ({
          id: m.id,
          name: m.name,
          displayName: m.displayName,
          modelType: (m.modelType ?? 'chat') as ModelType,
          contextWindow: m.contextWindow,
          isDefault: m.isDefault,
        })),
      );
    }
  },
  { immediate: true },
);

function addModel() {
  models.push({
    id: `m-${Date.now()}`,
    name: '',
    displayName: '',
    modelType: 'chat',
    contextWindow: 128_000,
    isDefault: models.length === 0,
  });
}

function removeModel(idx: number) {
  models.splice(idx, 1);
}

function setDefault(idx: number) {
  models.forEach((m, i) => (m.isDefault = i === idx));
}

function handleOk() {
  const result: Partial<Provider> = {
    name: form.name,
    type: form.type,
    baseUrl: form.baseUrl,
    enabled: form.enabled,
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      displayName: m.displayName || m.name,
      modelType: m.modelType,
      contextWindow: m.contextWindow,
      supportsStreaming: true,
      supportsToolUse: true,
      supportsVision: false,
      supportsThinking: false,
      pricing: { input: 0, output: 0 },
      isDefault: m.isDefault,
    })),
  };
  if (form.apiKey) {
    result.apiKeyMasked = `${form.apiKey.slice(0, 6)}****${form.apiKey.slice(-4)}`;
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
    :title="title"
    :width="560"
    :ok-text="isEdit ? '保存' : '创建'"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="space-y-4 py-2">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            名称 <span class="text-red-500">*</span>
          </label>
          <a-input v-model:value="form.name" placeholder="如：OpenAI 兼容" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            类型 <span class="text-red-500">*</span>
          </label>
          <a-select
            v-model:value="form.type"
            class="w-full"
            :options="providerTypeOptions as any"
            :disabled="isEdit"
          />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          Base URL <span class="text-red-500">*</span>
        </label>
        <a-input
          v-model:value="form.baseUrl"
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          API Key{{ isEdit ? '（留空则不修改）' : '' }}
        </label>
        <a-input-password
          v-model:value="form.apiKey"
          :placeholder="isEdit ? '••••••••' : 'sk-...'"
        />
      </div>

      <div class="flex items-center gap-2">
        <a-switch v-model:checked="form.enabled" size="small" />
        <span class="text-[12px]">启用此供应商</span>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <label class="text-[12px] font-medium">模型列表</label>
          <button
            class="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
            @click="addModel"
          >
            <component :is="PlusIcon" class="h-3 w-3" />
            添加模型
          </button>
        </div>
        <div class="space-y-2">
          <div
            v-for="(m, idx) in models"
            :key="m.id"
            class="rounded-md border border-border bg-background px-2 py-1.5"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="m.displayName"
                class="h-7 w-[120px] rounded border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                placeholder="展示名称"
              />
              <input
                v-model="m.name"
                class="h-7 flex-1 rounded border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                placeholder="模型标识（如 gpt-4o）"
              />
              <label class="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="radio"
                  :checked="m.isDefault"
                  class="accent-primary"
                  @change="setDefault(idx)"
                />
                默认
              </label>
              <button
                class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                @click="removeModel(idx)"
              >
                <component :is="TrashIcon" class="h-3 w-3" />
              </button>
            </div>
            <div class="mt-1.5 flex items-center gap-2">
              <label class="text-[11px] text-muted-foreground">类型</label>
              <a-select
                v-model:value="m.modelType"
                class="h-7 flex-1"
                size="small"
                :options="modelTypeOptions as any"
              />
              <label class="flex items-center gap-1 text-[11px] text-muted-foreground">
                上下文
                <input
                  v-model.number="m.contextWindow"
                  type="number"
                  class="h-7 w-24 rounded border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                  placeholder="128000"
                />
              </label>
            </div>
          </div>
          <div
            v-if="models.length === 0"
            class="rounded-md border border-dashed border-border py-4 text-center text-[11px] text-muted-foreground"
          >
            暂无模型，点击「添加模型」
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>