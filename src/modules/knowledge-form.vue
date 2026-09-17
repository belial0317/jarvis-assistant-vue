<script lang="ts" setup>
import {
  Input as AInput,
  InputNumber as AInputNumber,
  Modal as AModal,
  Select as ASelect,
  Textarea as ATextarea,
  message,
} from 'ant-design-vue';

import { createIconifyIcon } from '../providers/icons';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import type {
  ChunkStructureType,
  IndexTechnique,
  KnowledgeBase,
  RetrievalMethod,
} from '../types';

import { listProviders } from '../api/provider';

defineOptions({ name: 'AiKnowledgeForm' });

const UploadIcon = createIconifyIcon('lucide:upload');
const FileIcon = createIconifyIcon('lucide:file-text');
const XIcon = createIconifyIcon('lucide:x');

const props = defineProps<{
  open: boolean;
  data?: KnowledgeBase | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  submit: [data: Partial<KnowledgeBase>, files: File[]];
}>();

/** 新建时选择的文件列表 */
const selectedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement>();
const isDragging = ref(false);

const isEdit = computed(() => !!props.data);

function triggerFileSelect() {
  fileInput.value?.click();
}

function handleFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  addFiles(target.files);
  target.value = '';
}

function handleDrop(e: DragEvent) {
  isDragging.value = false;
  addFiles(e.dataTransfer?.files);
}

function addFiles(fileList: FileList | null | undefined) {
  if (!fileList) return;
  for (const f of Array.from(fileList)) {
    if (f.size > 100 * 1024 * 1024) {
      message.warning(`文件 ${f.name} 超过 100MB，已跳过`);
      continue;
    }
    selectedFiles.value.push(f);
  }
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1);
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const indexTechniqueOptions: Array<{ label: string; value: IndexTechnique }> = [
  { label: '高质量（向量索引）', value: 'high_quality' },
  { label: '经济（关键词索引）', value: 'economy' },
];

const structureOptions: Array<{ label: string; value: ChunkStructureType }> = [
  { label: '文本分块', value: 'text_model' },
  { label: 'QA 模式', value: 'qa_model' },
  { label: '父子分块', value: 'hierarchical_model' },
];

const searchMethodOptions: Array<{ label: string; value: RetrievalMethod }> = [
  { label: '语义检索', value: 'semantic_search' },
  { label: '全文检索', value: 'full_text_search' },
  { label: '混合检索', value: 'hybrid_search' },
  { label: '关键词检索', value: 'keyword_search' },
];

/** Embedding 模型选项：从已启用供应商动态加载，按 modelType='embedding' 过滤 */
const embeddingModelOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadEmbeddingModelOptions() {
  try {
    const providers = await listProviders({ enabled: true });
    const options: Array<{ label: string; value: string }> = [];
    providers.forEach((p) => {
      (p.models ?? []).forEach((m) => {
        if (m.modelType === 'embedding') {
          options.push({
            label: `${p.name} · ${m.displayName || m.name}`,
            value: m.id,
          });
        }
      });
    });
    embeddingModelOptions.value = options;
  } catch {
    embeddingModelOptions.value = [];
  }
}

onMounted(loadEmbeddingModelOptions);

watch(
  () => props.open,
  (val) => {
    if (val) loadEmbeddingModelOptions();
  },
);

interface FormState {
  name: string;
  description: string;
  indexTechnique: IndexTechnique;
  embeddingModelId: string;
  structure: ChunkStructureType;
  separator: string;
  maxTokens: number;
  chunkOverlap: number;
  searchMethod: RetrievalMethod;
  topK: number;
  scoreThresholdEnabled: boolean;
  scoreThreshold: number;
}

const defaultState = (): FormState => ({
  name: '',
  description: '',
  indexTechnique: 'high_quality',
  embeddingModelId: embeddingModelOptions.value[0]?.value ?? '',
  structure: 'text_model',
  separator: '\\n',
  maxTokens: 512,
  chunkOverlap: 64,
  searchMethod: 'hybrid_search',
  topK: 4,
  scoreThresholdEnabled: true,
  scoreThreshold: 0.5,
});

const form = reactive<FormState>(defaultState());

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    Object.assign(form, defaultState());
    selectedFiles.value = [];
    if (props.data) {
      form.name = props.data.name;
      form.description = props.data.description;
      form.indexTechnique = props.data.indexTechnique;
      form.embeddingModelId = props.data.embeddingModelId;
      form.structure = props.data.chunkConfig.structure;
      form.separator = props.data.chunkConfig.separator;
      form.maxTokens = props.data.chunkConfig.maxTokens;
      form.chunkOverlap = props.data.chunkConfig.chunkOverlap;
      form.searchMethod = props.data.retrievalModel.searchMethod;
      form.topK = props.data.retrievalModel.topK;
      form.scoreThresholdEnabled = props.data.retrievalModel.scoreThresholdEnabled;
      form.scoreThreshold = props.data.retrievalModel.scoreThreshold ?? 0.5;
    }
  },
  { immediate: true },
);

function handleOk() {
  if (!form.name.trim()) {
    message.warning('请输入知识库名称');
    return;
  }
  const result: Partial<KnowledgeBase> = {
    name: form.name,
    description: form.description,
    indexTechnique: form.indexTechnique,
    embeddingModelId: form.embeddingModelId,
    chunkConfig: {
      structure: form.structure,
      separator: form.separator,
      maxTokens: form.maxTokens,
      chunkOverlap: form.chunkOverlap,
      preProcessingRules: [
        { id: 'remove_extra_spaces', enabled: true },
        { id: 'remove_urls_emails', enabled: false },
      ],
    },
    retrievalModel: {
      searchMethod: form.searchMethod,
      rerankingEnable: false,
      topK: form.topK,
      scoreThresholdEnabled: form.scoreThresholdEnabled,
      scoreThreshold: form.scoreThresholdEnabled ? form.scoreThreshold : undefined,
    },
    documentCount: 0,
    totalChunks: 0,
    status: 'empty',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  emit('submit', result, selectedFiles.value);
  emit('update:open', false);
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <a-modal
    :open="open"
    :title="data ? '编辑知识库' : '新建知识库'"
    :width="560"
    :ok-text="data ? '保存' : '创建'"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="handleCancel"
  >
    <div class="space-y-3 py-2">
      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">
          名称 <span class="text-red-500">*</span>
        </label>
        <a-input v-model:value="form.name" placeholder="如：项目文档库" />
      </div>

      <div>
        <label class="mb-1 block text-[12px] text-muted-foreground">描述</label>
        <a-textarea
          v-model:value="form.description"
          :rows="2"
          placeholder="简要描述知识库内容"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">索引技术</label>
          <a-select
            v-model:value="form.indexTechnique"
            class="w-full"
            :options="indexTechniqueOptions"
          />
        </div>
        <div>
          <label class="mb-1 block text-[12px] text-muted-foreground">Embedding 模型</label>
          <a-select
            v-model:value="form.embeddingModelId"
            class="w-full"
            :options="embeddingModelOptions"
          />
        </div>
      </div>

      <div class="rounded-md border border-border bg-muted/30 p-3">
        <div class="mb-2 text-[12px] font-medium">分块配置</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-[11px] text-muted-foreground">分块结构</label>
            <a-select
              v-model:value="form.structure"
              class="w-full"
              :options="structureOptions"
            />
          </div>
          <div>
            <label class="mb-1 block text-[11px] text-muted-foreground">分隔符</label>
            <a-input v-model:value="form.separator" placeholder="\n" />
          </div>
          <div>
            <label class="mb-1 block text-[11px] text-muted-foreground">最大分块（tokens）</label>
            <a-input-number
              v-model:value="form.maxTokens"
              :min="128"
              :max="4096"
              :step="64"
              class="w-full"
            />
          </div>
          <div>
            <label class="mb-1 block text-[11px] text-muted-foreground">重叠（tokens）</label>
            <a-input-number
              v-model:value="form.chunkOverlap"
              :min="0"
              :max="512"
              :step="16"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <div class="rounded-md border border-border bg-muted/30 p-3">
        <div class="mb-2 text-[12px] font-medium">检索配置</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-[11px] text-muted-foreground">检索方法</label>
            <a-select
              v-model:value="form.searchMethod"
              class="w-full"
              :options="searchMethodOptions"
            />
          </div>
          <div>
            <label class="mb-1 block text-[11px] text-muted-foreground">Top-K</label>
            <a-input-number
              v-model:value="form.topK"
              :min="1"
              :max="20"
              class="w-full"
            />
          </div>
          <div class="col-span-2 flex items-center gap-2">
            <label class="flex cursor-pointer items-center gap-1.5 text-[12px]">
              <input
                v-model="form.scoreThresholdEnabled"
                type="checkbox"
                class="accent-primary"
              />
              启用分数阈值
            </label>
            <a-input-number
              v-if="form.scoreThresholdEnabled"
              v-model:value="form.scoreThreshold"
              :min="0"
              :max="1"
              :step="0.05"
              class="w-24"
            />
          </div>
        </div>
      </div>

      <!-- 文件上传区域（仅新建时显示） -->
      <div v-if="!isEdit" class="rounded-md border border-border bg-muted/30 p-3">
        <div class="mb-2 text-[12px] font-medium">上传文档 <span class="text-muted-foreground font-normal">（可选，创建后自动上传）</span></div>
        <div
          class="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-4 transition-colors hover:border-primary/50"
          :class="isDragging ? 'border-primary bg-primary/5' : ''"
          @click="triggerFileSelect"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
        >
          <component :is="UploadIcon" class="h-5 w-5 text-muted-foreground" />
          <span class="text-[11px] text-muted-foreground">点击选择或拖拽文件到此处</span>
          <span class="text-[10px] text-muted-foreground/70">支持 PDF、DOCX、TXT、MD、HTML、JSON、CSV，单个文件最大 100MB</span>
        </div>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          multiple
          accept=".pdf,.docx,.txt,.md,.html,.json,.csv"
          @change="handleFileSelected"
        />
        <div v-if="selectedFiles.length > 0" class="mt-2 space-y-1">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="flex items-center gap-2 rounded bg-background px-2 py-1"
          >
            <component :is="FileIcon" class="h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <span class="flex-1 truncate text-[11px]">{{ file.name }}</span>
            <span class="flex-shrink-0 text-[10px] text-muted-foreground">{{ formatSize(file.size) }}</span>
            <button
              type="button"
              class="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
              @click="removeFile(index)"
            >
              <component :is="XIcon" class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>