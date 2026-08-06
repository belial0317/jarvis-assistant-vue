<script lang="ts" setup>
import {
  Input as AInput,
  Modal as AModal,
  Select as ASelect,
  Textarea as ATextarea,
  message,
} from 'ant-design-vue';

import { reactive, ref, watch } from 'vue';

import type { SkillCategoryVO } from '../api/skill';
import type { Skill, SkillCategory } from '../types';

import { listSkillCategories } from '../api/skill';

defineOptions({ name: 'AiSkillForm' });

const props = defineProps<{
  open: boolean;
  data?: Skill | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  submit: [data: Partial<Skill>];
}>();

interface FormState {
  name: string;
  description: string;
  category: SkillCategory;
  icon: string;
  promptTemplate: string;
  allowedTools: string;
  triggerKeywords: string;
}

const defaultState = (): FormState => ({
  name: '',
  description: '',
  category: 'custom',
  icon: 'lucide:wand-sparkles',
  promptTemplate: '',
  allowedTools: 'read_file',
  triggerKeywords: '',
});

const form = reactive<FormState>(defaultState());

// 动态分类选项（从后端字典加载）
const categoryOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadCategoryOptions() {
  try {
    const list: SkillCategoryVO[] = await listSkillCategories();
    categoryOptions.value = list.map((c) => ({
      label: c.categoryName,
      value: c.categoryKey,
    }));
    // 确保当前选中值存在于选项中，否则回退到 custom
    if (form.category && !list.some((c) => c.categoryKey === form.category)) {
      form.category = 'custom';
    }
  } catch {
    categoryOptions.value = [];
  }
}

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    loadCategoryOptions();
    Object.assign(form, defaultState());
    if (props.data) {
      form.name = props.data.name;
      form.description = props.data.description;
      form.category = props.data.category;
      form.icon = props.data.icon;
      form.promptTemplate = props.data.promptTemplate;
      form.allowedTools = props.data.allowedTools.join(', ');
      form.triggerKeywords = props.data.triggerKeywords.join(', ');
    }
  },
  { immediate: true },
);

function handleOk() {
  if (!form.name.trim()) {
    message.warning('请输入技能名称');
    return;
  }
  if (!form.promptTemplate.trim()) {
    message.warning('请输入 Prompt 模板');
    return;
  }
  const result: Partial<Skill> = {
    name: form.name.startsWith('/') ? form.name : `/${form.name}`,
    description: form.description,
    category: form.category,
    icon: form.icon,
    promptTemplate: form.promptTemplate,
    allowedTools: form.allowedTools
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    triggerKeywords: form.triggerKeywords
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    parameters: [],
    enabled: true,
    isBuiltin: false,
    version: '1.0.0',
    usageCount: 0,
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
    :title="data ? '编辑技能' : '新建技能'"
    :width="520"
    :ok-text="data ? '保存' : '创建'"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="space-y-3 py-2">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            技能名称 <span class="text-red-500">*</span>
          </label>
          <a-input v-model:value="form.name" placeholder="/my-skill" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">分类</label>
          <a-select
            v-model:value="form.category"
            class="w-full"
            :options="categoryOptions"
            placeholder="选择分类"
          />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">描述</label>
        <a-input v-model:value="form.description" placeholder="简要描述技能功能" />
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          Prompt 模板 <span class="text-red-500">*</span>
        </label>
        <a-textarea
          v-model:value="form.promptTemplate"
          :rows="5"
          placeholder="支持 {{var}} 占位符"
          class="font-mono text-[12px]"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            授权工具（逗号分隔）
          </label>
          <a-input v-model:value="form.allowedTools" placeholder="read_file, grep" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">
            触发词（逗号分隔）
          </label>
          <a-input v-model:value="form.triggerKeywords" placeholder="/my-skill, 我的技能" />
        </div>
      </div>
    </div>
  </a-modal>
</template>