<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import { Drawer as ADrawer, message, Modal } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';

import type {
  DocumentSegment,
  KnowledgeBase,
  KnowledgeDocument,
  RetrievalResult,
} from '../types';

import { docTypeIcon, kbStatusText } from '../constants';
import {
  deleteDocument,
  deleteKnowledgeBase,
  listDocumentSegments,
  listDocuments,
  listKnowledgeBases,
  reindexDocument,
  retrieve,
  saveKnowledgeBase,
  uploadDocument,
} from '../api/knowledge';
import { useBackendHealth } from '../composables/use-backend-health';

import KnowledgeForm from './knowledge-form.vue';

defineOptions({ name: 'AiKnowledgeCompact' });

const PlusIcon = createIconifyIcon('lucide:plus');
const ChevronIcon = createIconifyIcon('lucide:chevron-down');
const SearchIcon = createIconifyIcon('lucide:search');
const DatabaseIcon = createIconifyIcon('lucide:database');
const TrashIcon = createIconifyIcon('lucide:trash');
const Trash2Icon = createIconifyIcon('lucide:trash-2');
const PencilIcon = createIconifyIcon('lucide:pencil');
const ListIcon = createIconifyIcon('lucide:list');
const RefreshIcon = createIconifyIcon('lucide:refresh-cw');
const UploadIcon = createIconifyIcon('lucide:upload');

const kbs = ref<KnowledgeBase[]>([]);
const loading = ref(false);
const activeKbId = ref<string>('');
const expandedId = ref<string>('');
const formOpen = ref(false);
const editingData = ref<KnowledgeBase | null>(null);

const health = useBackendHealth();

const searchQuery = ref('');
const searchResults = ref<RetrievalResult[]>([]);
const searching = ref(false);

const documentsCache = ref<Record<string, KnowledgeDocument[]>>({});

const documents = computed(() =>
  activeKbId.value ? documentsCache.value[activeKbId.value] ?? [] : [],
);

// 文档上传
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
// 文档操作（分段查看 / 重索引 / 删除），同一时刻仅允许一个
const operatingDocId = ref('');
// 分段查看抽屉
const segmentDrawerOpen = ref(false);
const segmentDocId = ref('');
const segmentDocName = ref('');
const segments = ref<DocumentSegment[]>([]);
const segmentsLoading = ref(false);

const indexTechniqueText: Record<string, string> = {
  high_quality: '高质量',
  economy: '经济',
};

const searchMethodText: Record<string, string> = {
  semantic_search: '语义检索',
  full_text_search: '全文检索',
  hybrid_search: '混合检索',
  keyword_search: '关键词检索',
};

const structureText: Record<string, string> = {
  text_model: '文本分块',
  qa_model: 'QA 模式',
  hierarchical_model: '父子分块',
};

async function loadKbs() {
  loading.value = true;
  try {
    kbs.value = await listKnowledgeBases();
  } catch {
    kbs.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadDocuments(kbId: string) {
  if (documentsCache.value[kbId]) return;
  try {
    const docs = await listDocuments(kbId);
    documentsCache.value[kbId] = docs;
  } catch {
    documentsCache.value[kbId] = [];
  }
}

/** 强制刷新文档列表（清除缓存后重新拉取） */
async function reloadDocuments(kbId: string) {
  if (!kbId) return;
  delete documentsCache.value[kbId];
  await loadDocuments(kbId);
}

function toggle(id: string) {
  if (expandedId.value === id) {
    expandedId.value = '';
    activeKbId.value = '';
  } else {
    expandedId.value = id;
    activeKbId.value = id;
    loadDocuments(id);
  }
}

async function doSearch() {
  if (!searchQuery.value.trim() || !activeKbId.value) return;
  searching.value = true;
  searchResults.value = [];
  try {
    searchResults.value = await retrieve(activeKbId.value, searchQuery.value);
  } catch {
    message.error('检索失败');
  } finally {
    searching.value = false;
  }
}

function handleAdd() {
  editingData.value = null;
  formOpen.value = true;
}

function handleEdit(kb: KnowledgeBase) {
  editingData.value = kb;
  formOpen.value = true;
}

function handleDeleteKb(kb: KnowledgeBase) {
  Modal.confirm({
    title: '删除知识库',
    content: `确定要删除「${kb.name}」吗？将级联清理所有文档与向量数据，删除后不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteKnowledgeBase(kb.id);
        const idx = kbs.value.findIndex((k) => k.id === kb.id);
        if (idx !== -1) {
          kbs.value.splice(idx, 1);
        }
        delete documentsCache.value[kb.id];
        if (activeKbId.value === kb.id) {
          activeKbId.value = '';
          expandedId.value = '';
        }
        message.success(`知识库 ${kb.name} 已删除`);
      } catch {
        message.error('删除失败');
      }
    },
  });
}

/** 触发隐藏文件选择框 */
function triggerUpload() {
  if (!activeKbId.value) return;
  fileInput.value?.click();
}

/** 从卡片头部直接上传：先切换到对应知识库再触发文件选择 */
function triggerUploadForKb(kbId: string) {
  activeKbId.value = kbId;
  expandedId.value = kbId;
  loadDocuments(kbId);
  fileInput.value?.click();
}

/** 选择文件后上传 */
async function handleFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  // 重置以便重复选择同一文件
  target.value = '';
  if (!file || !activeKbId.value) return;
  // 文件大小限制 100MB
  if (file.size > 100 * 1024 * 1024) {
    message.warning('文件大小不能超过 100MB');
    return;
  }
  uploading.value = true;
  try {
    await uploadDocument(activeKbId.value, file);
    await reloadDocuments(activeKbId.value);
    message.success('文档上传成功');
  } catch {
    message.error('上传失败');
  } finally {
    uploading.value = false;
  }
}

/** 查看文档分段 */
async function handleViewSegments(doc: KnowledgeDocument) {
  segmentDocId.value = doc.id;
  segmentDocName.value = doc.name;
  segmentDrawerOpen.value = true;
  segmentsLoading.value = true;
  segments.value = [];
  try {
    segments.value = await listDocumentSegments(doc.id);
  } catch {
    segments.value = [];
  } finally {
    segmentsLoading.value = false;
  }
}

/** 重新索引文档 */
async function handleReindex(doc: KnowledgeDocument) {
  if (operatingDocId.value) return;
  operatingDocId.value = doc.id;
  try {
    await reindexDocument(doc.id);
    message.success('已提交重新索引');
    await reloadDocuments(doc.kbId);
  } catch {
    message.error('重索引失败');
  } finally {
    operatingDocId.value = '';
  }
}

/** 删除文档 */
function handleDeleteDoc(doc: KnowledgeDocument) {
  if (operatingDocId.value) return;
  Modal.confirm({
    title: '删除文档',
    content: `确定要删除「${doc.name}」吗？删除后不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteDocument(doc.id);
        await reloadDocuments(doc.kbId);
        message.success('文档已删除');
      } catch {
        message.error('删除失败');
      }
    },
  });
}

async function handleSubmit(data: Partial<KnowledgeBase>, files: File[]) {
  const isEdit = !!editingData.value?.id;
  try {
    const id = await saveKnowledgeBase({
      id: editingData.value?.id,
      name: data.name ?? '未命名',
      description: data.description ?? '',
      indexTechnique: data.indexTechnique ?? 'high_quality',
      embeddingModelId: data.embeddingModelId ?? 'openai-text-embedding-3-small',
      chunkConfig: data.chunkConfig,
      retrievalModel: data.retrievalModel,
    });
    if (isEdit) {
      // 编辑：本地原地更新
      const idx = kbs.value.findIndex((k) => k.id === editingData.value!.id);
      if (idx !== -1) {
        const prev = kbs.value[idx]!;
        kbs.value[idx] = {
          ...prev,
          name: data.name ?? prev.name,
          description: data.description ?? prev.description,
          indexTechnique: data.indexTechnique ?? prev.indexTechnique,
          embeddingModelId: data.embeddingModelId ?? prev.embeddingModelId,
          chunkConfig: data.chunkConfig ?? prev.chunkConfig,
          retrievalModel: data.retrievalModel ?? prev.retrievalModel,
          updatedAt: Date.now(),
        };
      }
      message.success('知识库已更新');
    } else {
      // 新建：插入列表顶部
      const newKb: KnowledgeBase = {
        id,
        name: data.name ?? '未命名',
        description: data.description ?? '',
        indexTechnique: data.indexTechnique ?? 'high_quality',
        embeddingModelId: data.embeddingModelId ?? 'openai-text-embedding-3-small',
        chunkConfig: data.chunkConfig ?? {
          structure: 'text_model',
          separator: '\\n',
          maxTokens: 512,
          chunkOverlap: 64,
          preProcessingRules: [],
        },
        retrievalModel: data.retrievalModel ?? {
          searchMethod: 'hybrid_search',
          rerankingEnable: false,
          topK: 4,
          scoreThresholdEnabled: false,
        },
        documentCount: 0,
        totalChunks: 0,
        status: 'empty',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      kbs.value.unshift(newKb);
      // 新建后自动展开，方便用户立即上传文档
      expandedId.value = newKb.id;
      activeKbId.value = newKb.id;
      loadDocuments(newKb.id);
      message.success(`知识库 ${newKb.name} 已创建`);
      // 如果新建时选择了文件，创建后自动上传
      if (files.length > 0) {
        uploading.value = true;
        for (const file of files) {
          try {
            await uploadDocument(newKb.id, file);
          } catch {
            message.error(`文件 ${file.name} 上传失败`);
          }
        }
        uploading.value = false;
        await reloadDocuments(newKb.id);
        await loadKbs();
        message.success(`${files.length} 个文件上传完成`);
      }
    }
  } catch {
    message.error(isEdit ? '更新失败' : '创建失败');
  }
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadKbs();
});
</script>

<template>
  <!-- 离线占位：整页替换，避免渲染主列表时触发额外 API -->
  <div
    v-if="health.state === 'disconnected'"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
  >
    <div class="text-2xl">⚠</div>
    <div>后端未连接，无法加载知识库</div>
    <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
  </div>
  <div v-else class="flex h-full flex-col">
    <div
      class="flex h-[38px] flex-shrink-0 items-center justify-between border-b border-border bg-background px-3"
    >
      <span class="text-[13px] font-medium">知识库</span>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
        @click="handleAdd"
      >
        <component :is="PlusIcon" class="h-3 w-3" />
        新建知识库
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2.5">
      <div class="space-y-1.5">
        <div
          v-for="kb in kbs"
          :key="kb.id"
          class="rounded-lg border border-border bg-card transition-colors hover:border-primary/30"
        >
          <!-- 知识库卡片头部 -->
          <div
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2"
            @click="toggle(kb.id)"
          >
            <div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
              <component :is="DatabaseIcon" class="h-3.5 w-3.5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[12px] font-medium">{{ kb.name }}</span>
                <span class="h-1.5 w-1.5 rounded-full" :class="kbStatusText[kb.status]?.dot" />
              </div>
              <div class="truncate text-[11px] text-muted-foreground">
                {{ kb.documentCount }} 文档 · {{ kb.totalChunks }} chunks · {{ indexTechniqueText[kb.indexTechnique] }}
              </div>
            </div>
            <div class="flex flex-shrink-0 items-center gap-0.5">
              <button
                title="上传文档"
                class="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                :disabled="uploading"
                @click.stop="triggerUploadForKb(kb.id)"
              >
                <component :is="UploadIcon" class="h-3 w-3" />
              </button>
              <button
                title="编辑"
                class="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                @click.stop="handleEdit(kb)"
              >
                <component :is="PencilIcon" class="h-3 w-3" />
              </button>
              <button
                title="删除"
                class="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                @click.stop="handleDeleteKb(kb)"
              >
                <component :is="TrashIcon" class="h-3 w-3" />
              </button>
            </div>
            <component
              :is="ChevronIcon"
              class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform"
              :class="expandedId === kb.id ? 'rotate-180' : ''"
            />
          </div>

          <!-- 展开内容 -->
          <div v-if="expandedId === kb.id" class="border-t border-border px-3 py-2.5">
            <!-- 索引配置 -->
            <div class="mb-2 grid grid-cols-2 gap-1.5 text-[11px]">
              <div class="rounded bg-muted px-2 py-1">
                <div class="text-[10px] text-muted-foreground">分块结构</div>
                <div class="font-medium">{{ structureText[kb.chunkConfig.structure] }}</div>
              </div>
              <div class="rounded bg-muted px-2 py-1">
                <div class="text-[10px] text-muted-foreground">检索方法</div>
                <div class="font-medium">{{ searchMethodText[kb.retrievalModel.searchMethod] }}</div>
              </div>
              <div class="rounded bg-muted px-2 py-1">
                <div class="text-[10px] text-muted-foreground">分块大小</div>
                <div class="font-medium">{{ kb.chunkConfig.maxTokens }} tokens</div>
              </div>
              <div class="rounded bg-muted px-2 py-1">
                <div class="text-[10px] text-muted-foreground">Top-K</div>
                <div class="font-medium">{{ kb.retrievalModel.topK }}</div>
              </div>
            </div>

            <!-- Embedding 模型 -->
            <div class="mb-2 flex items-center gap-1 text-[11px]">
              <span class="text-muted-foreground">Embedding:</span>
              <code class="rounded bg-muted px-1.5 py-0.5 text-[10px]">{{ kb.embeddingModelId }}</code>
              <span v-if="kb.retrievalModel.rerankingEnable" class="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-500">
                Rerank
              </span>
            </div>

            <!-- 文档列表 -->
            <div class="mb-2">
              <div class="mb-1 flex items-center justify-between">
                <span class="text-[10px] font-medium text-muted-foreground">文档 ({{ documents.length }})</span>
                <button
                  type="button"
                  class="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
                  :disabled="uploading"
                  @click="triggerUpload"
                >
                  <component :is="PlusIcon" class="h-3 w-3" />
                  {{ uploading ? '上传中…' : '上传文档' }}
                </button>
              </div>
              <div class="space-y-1">
                <div
                  v-for="doc in documents"
                  :key="doc.id"
                  class="flex items-center gap-2 rounded bg-muted/50 px-2 py-1"
                >
                  <span class="text-[14px]">{{ docTypeIcon[doc.type] }}</span>
                  <span class="flex-1 truncate text-[11px]">{{ doc.name }}</span>
                  <span
                    v-if="doc.status === 'ready'"
                    class="text-[10px] text-emerald-500"
                  >
                    {{ doc.chunkCount }} chunks
                  </span>
                  <span
                    v-else-if="doc.status === 'embedding' || doc.status === 'parsing' || doc.status === 'chunking'"
                    class="flex items-center gap-1 text-[10px] text-amber-500"
                  >
                    {{ doc.progress ?? 0 }}%
                  </span>
                  <span v-else class="text-[10px] text-red-500">失败</span>
                  <div class="flex flex-shrink-0 items-center gap-0.5">
                    <button
                      title="查看分段"
                      class="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                      :disabled="operatingDocId === doc.id"
                      @click.stop="handleViewSegments(doc)"
                    >
                      <component :is="ListIcon" class="h-3 w-3" />
                    </button>
                    <button
                      title="重新索引"
                      class="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                      :disabled="operatingDocId === doc.id"
                      @click.stop="handleReindex(doc)"
                    >
                      <component
                        :is="RefreshIcon"
                        class="h-3 w-3"
                        :class="operatingDocId === doc.id ? 'animate-spin' : ''"
                      />
                    </button>
                    <button
                      title="删除"
                      class="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      :disabled="operatingDocId === doc.id"
                      @click.stop="handleDeleteDoc(doc)"
                    >
                      <component :is="Trash2Icon" class="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div v-if="documents.length === 0" class="py-2 text-center text-[10px] text-muted-foreground">
                  暂无文档
                </div>
              </div>
            </div>

            <!-- 检索测试 -->
            <div>
              <div class="mb-1 text-[10px] font-medium text-muted-foreground">检索测试</div>
              <div class="flex gap-1.5">
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="输入查询文本…"
                  class="h-7 flex-1 rounded-md border border-border bg-transparent px-2 text-[12px] outline-none focus:border-primary/50"
                  @keydown.enter="doSearch"
                />
                <button
                  type="button"
                  class="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  :disabled="!searchQuery.trim() || searching"
                  @click="doSearch"
                >
                  <component :is="SearchIcon" class="h-3 w-3" />
                  {{ searching ? '…' : '查询' }}
                </button>
              </div>

              <!-- 检索结果 -->
              <div v-if="searchResults.length > 0" class="mt-2 space-y-1.5">
                <div
                  v-for="(result, idx) in searchResults"
                  :key="idx"
                  class="rounded-md border border-border p-2"
                >
                  <div class="mb-1 flex items-center gap-1.5">
                    <span class="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">#{{ idx + 1 }}</span>
                    <span class="truncate text-[10px] text-muted-foreground">{{ result.documentName }}</span>
                    <span class="ml-auto flex items-center gap-1">
                      <div class="h-1 w-12 overflow-hidden rounded-full bg-muted">
                        <div
                          class="h-full rounded-full bg-primary"
                          :style="{ width: `${result.score * 100}%` }"
                        />
                      </div>
                      <span class="text-[10px] font-medium text-primary">{{ result.score.toFixed(3) }}</span>
                    </span>
                  </div>
                  <p class="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">{{ result.content }}</p>
                </div>
              </div>
              <div v-else-if="searching" class="mt-2 py-2 text-center text-[10px] text-muted-foreground">
                检索中…
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="hidden"
      accept=".pdf,.docx,.txt,.md,.html,.json,.csv"
      @change="handleFileSelected"
    >

    <a-drawer
      v-model:open="segmentDrawerOpen"
      :width="600"
      title="文档分段"
      placement="right"
    >
      <div class="space-y-3">
        <div class="text-[12px] text-muted-foreground">{{ segmentDocName }}</div>
        <div v-if="segmentsLoading" class="py-8 text-center text-[12px] text-muted-foreground">
          加载中…
        </div>
        <div v-else-if="segments.length === 0" class="py-8 text-center text-[12px] text-muted-foreground">
          暂无分段
        </div>
        <div
          v-for="seg in segments"
          :key="seg.id"
          class="rounded-md border border-border p-2.5"
        >
          <div class="mb-1.5 flex items-center gap-1.5">
            <span class="rounded bg-muted px-1.5 py-px text-[10px] font-medium">#{{ seg.position }}</span>
            <span class="text-[10px] text-muted-foreground">{{ seg.wordCount }} 字</span>
            <span class="text-[10px] text-muted-foreground">{{ seg.tokens }} tokens</span>
            <span v-if="seg.hitCount" class="ml-auto text-[10px] text-primary">命中 {{ seg.hitCount }}</span>
          </div>
          <textarea
            class="h-24 w-full resize-none rounded border border-border bg-muted/30 p-2 text-[11px] leading-relaxed outline-none"
            readonly
            :value="seg.content"
          />
          <div v-if="seg.answer" class="mt-1.5 rounded bg-violet-500/5 p-1.5">
            <div class="mb-0.5 text-[10px] text-violet-500">答案</div>
            <p class="text-[11px] leading-relaxed text-muted-foreground">{{ seg.answer }}</p>
          </div>
        </div>
      </div>
    </a-drawer>

    <KnowledgeForm v-model:open="formOpen" :data="editingData" @submit="handleSubmit" />
  </div>
</template>