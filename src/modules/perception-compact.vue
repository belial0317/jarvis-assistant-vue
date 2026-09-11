<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';
import {
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Tag,
} from 'ant-design-vue';

import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

import type {
  PerceptionConfigSaveDTO,
  PerceptionConfigVO,
} from '../api/perception';
import { useBackendHealth } from '../composables/use-backend-health';
import { usePerception } from '../composables/use-perception';

import {
  deletePerceptionConfig,
  listPerceptionConfigs,
  savePerceptionConfig,
} from '../api/perception';
import { fetchPageProfile } from '../api/chat';

import { loadPerceptionConfigs } from '../utils/page-context';

defineOptions({ name: 'AiPerceptionCompact' });

const PlusIcon = createIconifyIcon('lucide:plus');
const TrashIcon = createIconifyIcon('lucide:trash-2');
const EditIcon = createIconifyIcon('lucide:pencil');
const RadarIcon = createIconifyIcon('lucide:radar');

const configs = ref<PerceptionConfigVO[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);

const health = useBackendHealth();

const matchTypeOptions = [
  { label: '精确匹配', value: 'exact' },
  { label: '前缀匹配', value: 'prefix' },
  { label: '正则匹配', value: 'regex' },
];

const strategyOptions = [
  { label: '自动（表格转 Markdown + 文本）', value: 'auto' },
  { label: '仅表格', value: 'table_only' },
  { label: '仅文本', value: 'text_only' },
  { label: '全量（不压缩）', value: 'full' },
];

const matchTypeText: Record<string, string> = {
  exact: '精确',
  prefix: '前缀',
  regex: '正则',
};

const strategyText: Record<string, string> = {
  auto: '自动',
  table_only: '仅表格',
  text_only: '仅文本',
  full: '全量',
};

const form = reactive<PerceptionConfigSaveDTO>({
  routePattern: '',
  matchType: 'exact',
  selectors: [],
  strategy: 'auto',
  description: '',
  enabled: true,
});

const selectorInput = ref('');

function addSelector() {
  const val = selectorInput.value.trim();
  if (!val) return;
  if (form.selectors.includes(val)) {
    message.warning('该选择器已存在');
    return;
  }
  form.selectors.push(val);
  selectorInput.value = '';
}

function removeSelector(idx: number) {
  form.selectors.splice(idx, 1);
}

async function loadConfigs() {
  loading.value = true;
  try {
    configs.value = await listPerceptionConfigs();
    // 同步刷新 page-context 缓存，使配置变更即时生效
    await loadPerceptionConfigs();
  } catch {
    message.error('加载感知配置失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.routePattern = '';
  form.matchType = 'exact';
  form.selectors = [];
  form.strategy = 'auto';
  form.description = '';
  form.enabled = true;
  selectorInput.value = '';
  modalOpen.value = true;
}

function openEdit(row: PerceptionConfigVO) {
  editingId.value = row.id;
  form.routePattern = row.routePattern;
  form.matchType = row.matchType;
  form.selectors = [...row.selectors];
  form.strategy = row.strategy;
  form.description = row.description ?? '';
  form.enabled = row.enabled;
  selectorInput.value = '';
  modalOpen.value = true;
}

async function handleSave() {
  if (!form.routePattern.trim()) {
    message.warning('请填写路由模式');
    return;
  }
  if (!form.selectors.length) {
    message.warning('请至少添加一个 CSS 选择器');
    return;
  }
  saving.value = true;
  try {
    await savePerceptionConfig({
      ...form,
      id: editingId.value ?? undefined,
      routePattern: form.routePattern.trim(),
    });
    message.success(editingId.value ? '更新成功' : '创建成功');
    modalOpen.value = false;
    await loadConfigs();
  } catch {
    message.error('保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await deletePerceptionConfig(id);
    message.success('删除成功');
    await loadConfigs();
  } catch {
    message.error('删除失败');
  }
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  loadConfigs();
});

// ===== P4-T1：当前页面画像 =====
interface PageProfileView {
  pageType?: string;
  businessContent?: string;
  entities?: Array<{ name: string; type?: string; value: string }>;
  dataStatus?: string;
  operations?: string[];
  insight?: string;
}

const profile = ref<PageProfileView | null>(null);
const profileLoadFailed = ref(false);
const profileCapturedAt = ref<number>(0);
const nowTick = ref(Date.now());

const profileVisible = computed(() => !!profile.value);
const profileAgeText = computed(() => {
  if (!profileCapturedAt.value) return '';
  const age = Math.max(0, Math.round((nowTick.value - profileCapturedAt.value) / 1000));
  return age > 300 ? `采集于 ${Math.round(age / 60)} 分钟前（可能已过期）` : `采集于 ${age} 秒前`;
});

// T1-2/T1-3：画像请求收编统一 API;快照优先取感知管线(epoch/text 同源),
// 无快照回退手动采集并显式声明 fallback epoch(不伪造默认配置)
const perception = usePerception();

async function refreshProfile() {
  profileLoadFailed.value = false;
  try {
    const snapshot = perception.snapshot.value;
    const text =
      snapshot?.text ??
      (document.querySelector('#main-content') as HTMLElement | null)?.innerText ??
      document.body.innerText.slice(0, 8000);
    if (!text) {
      profile.value = null;
      profileLoadFailed.value = true;
      return;
    }
    const p = await fetchPageProfile({
      epoch: snapshot?.epoch ?? { configId: 'fallback', configVersion: 1 },
      routePath: location.pathname,
      capturedAt: snapshot?.capturedAt ?? Date.now(),
      mutationCount: snapshot?.mutationCount ?? 0,
      stale: snapshot?.stale ?? false,
      text,
    });
    // 空画像（解读关闭）→ 回退态；注意不渲染空壳
    const hasContent =
      p && (p.businessContent || p.dataStatus || (p.entities && p.entities.length));
    profile.value = hasContent ? p : null;
    profileCapturedAt.value = hasContent ? (snapshotCapturedAt.value || Date.now()) : 0;
    if (!hasContent) {
      profileLoadFailed.value = true;
    }
  } catch {
    profileLoadFailed.value = true;
  }
}

const snapshotCapturedAt = ref(0);

onMounted(() => {
  refreshProfile();
  // 时效计时器（30s 粒度足够）；感知中心页签 v-if 切换会重挂载，必须随卸载清理
  profileAgeTimer = setInterval(() => (nowTick.value = Date.now()), 30000);
});

let profileAgeTimer: ReturnType<typeof setInterval> | undefined;
onUnmounted(() => {
  if (profileAgeTimer) clearInterval(profileAgeTimer);
});

</script>

<template>
  <!-- 离线占位：整页替换 -->
  <div
    v-if="health.state === 'disconnected'"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
  >
    <div class="text-2xl">⚠</div>
    <div>后端未连接，无法加载页面感知配置</div>
    <div class="text-[11px] opacity-70">请在设置 → 后端服务 配置服务地址</div>
  </div>
  <div v-else class="flex h-full flex-col">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <div class="flex items-center gap-2">
        <RadarIcon class="h-4 w-4 text-primary" />
        <span class="text-sm font-semibold">页面感知配置</span>
        <Tag color="blue" class="ml-1">{{ configs.length }}</Tag>
      </div>
      <button
        class="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition hover:opacity-90"
        @click="openCreate"
      >
        <PlusIcon class="h-3.5 w-3.5" />
        新增配置
      </button>
    </div>

    <!-- P4-T1：当前页面画像（解读关闭/降级 → 显示回退说明，不渲染空壳） -->
    <div v-if="profileVisible" class="border-b border-border px-4 py-3">
      <div class="mb-2 flex items-center gap-2">
        <span class="text-xs font-semibold text-foreground">当前页面画像</span>
        <Tag v-if="profile?.pageType" color="purple" class="text-[10px]">{{ profile.pageType }}</Tag>
        <span v-if="profileAgeText" class="text-[10px] text-muted-foreground">{{ profileAgeText }}</span>
      </div>
      <div class="space-y-1.5 text-[11px] leading-4 text-muted-foreground">
        <div v-if="profile?.businessContent">业务：{{ profile.businessContent }}</div>
        <div v-if="profile?.dataStatus">数据：{{ profile.dataStatus }}</div>
        <div v-if="profile?.operations?.length">
          操作：{{ profile.operations.join(' → ') }}
        </div>
        <div v-if="profile?.entities?.length" class="flex flex-wrap items-center gap-1">
          <span>实体：</span>
          <span
            v-for="e in profile.entities.slice(0, 8)"
            :key="e.name + e.value"
            class="rounded border border-border bg-muted/40 px-1 py-px font-mono text-[10px]"
            :title="`${e.type}: ${e.value}`"
          >
            {{ e.name }}={{ e.value.length > 20 ? e.value.slice(0, 20) + '…' : e.value }}
          </span>
        </div>
        <div v-if="profile?.insight" class="rounded bg-amber-500/10 px-1.5 py-1 text-amber-600">
          💡 {{ profile.insight }}
        </div>
      </div>
    </div>
    <div
      v-else-if="profileLoadFailed"
      class="border-b border-border px-4 py-2 text-[10px] text-muted-foreground/70"
    >
      页面解读未启用或暂不可用，仅显示原文摘要。
    </div>

    <!-- 配置列表 -->
    <div class="flex-1 overflow-y-auto p-3">
      <div v-if="loading" class="space-y-2.5 px-1 py-2">
        <div v-for="i in 5" :key="i" class="h-10 animate-pulse rounded-lg bg-accent"></div>
      </div>
      <div
        v-else-if="!configs.length"
        class="flex flex-col items-center gap-2 py-12 text-muted-foreground"
      >
        <RadarIcon class="h-10 w-10 opacity-30" />
        <p class="text-xs">暂无感知配置</p>
        <p class="max-w-[280px] text-center text-[11px] leading-relaxed">
          为不同页面路由配置 CSS 选择器，让 AI 助手精准感知页面内容。
          未配置的路由将自动提取整个内容区。
        </p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="item in configs"
          :key="item.id"
          class="group rounded-lg border border-border p-3 transition hover:border-primary/50 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <code class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                  {{ item.routePattern }}
                </code>
                <Tag class="text-[10px]">{{ matchTypeText[item.matchType] }}</Tag>
                <Tag color="green" class="text-[10px]">{{ strategyText[item.strategy] }}</Tag>
                <Tag v-if="!item.enabled" color="red" class="text-[10px]">已禁用</Tag>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <Tag
                  v-for="sel in item.selectors"
                  :key="sel"
                  color="geekblue"
                  class="font-mono text-[10px]"
                >
                  {{ sel }}
                </Tag>
              </div>
              <p v-if="item.description" class="mt-1.5 text-[11px] text-muted-foreground">
                {{ item.description }}
              </p>
            </div>
            <div class="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                class="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                title="编辑"
                @click="openEdit(item)"
              >
                <EditIcon class="h-3.5 w-3.5" />
              </button>
              <Popconfirm
                :title="`确认删除「${item.routePattern}」配置？`"
                @confirm="handleDelete(item.id)"
              >
                <button
                  class="rounded p-1.5 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                  title="删除"
                >
                  <TrashIcon class="h-3.5 w-3.5" />
                </button>
              </Popconfirm>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑 Modal -->
    <Modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑感知配置' : '新增感知配置'"
      :confirm-loading="saving"
      :width="520"
      @ok="handleSave"
    >
      <div class="space-y-4 py-2">
        <div>
          <label class="mb-1 block text-xs font-medium">路由模式 *</label>
          <Input
            v-model:value="form.routePattern"
            placeholder="如 /system/user 或 /system/user/:id"
            :disabled="!!editingId"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            匹配此路由时使用下方选择器精准提取内容
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="mb-1 block text-xs font-medium">匹配方式</label>
            <Select
              v-model:value="form.matchType"
              :options="matchTypeOptions"
              class="w-full"
              size="small"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium">提取策略</label>
            <Select
              v-model:value="form.strategy"
              :options="strategyOptions"
              class="w-full"
              size="small"
            />
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium">CSS 选择器 *</label>
          <div class="flex gap-2">
            <Input
              v-model:value="selectorInput"
              placeholder="如 .ant-table 或 .ant-descriptions"
              @press-enter="addSelector"
            />
            <button
              class="shrink-0 rounded border border-border px-3 text-xs transition hover:bg-muted"
              type="button"
              @click="addSelector"
            >
              添加
            </button>
          </div>
          <div v-if="form.selectors.length" class="mt-2 flex flex-wrap gap-1">
            <Tag
              v-for="(sel, idx) in form.selectors"
              :key="sel"
              color="geekblue"
              closable
              class="font-mono"
              @close="removeSelector(idx)"
            >
              {{ sel }}
            </Tag>
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">
            按优先级提取多个区域，支持标准 CSS 选择器语法
          </p>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium">描述</label>
          <Input
            v-model:value="form.description"
            placeholder="可选，如「用户列表页 - 仅表格」"
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="text-xs font-medium">启用</label>
          <Switch v-model:checked="form.enabled" size="small" />
        </div>
      </div>
    </Modal>
  </div>
</template>