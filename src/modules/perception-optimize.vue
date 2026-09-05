<script lang="ts" setup>
/**
 * S7/F2 感知优化页:目标列表 + 规则建卡触发 + 指标汇总。
 * 飞轮的可视闭环入口:看目标 → 看评分/指标 → (S8)审批草稿。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';

import type { PerceptionDraftVO, PerceptionFewshotVO, PerceptionGoalVO } from '../api/goal';
import {
  approveDraft,
  archiveGoal,
  createDraft,
  createGoal,
  getMetricsSummary,
  listDrafts,
  listFewshots,
  listGoals,
  rejectDraft,
  removeFewshot,
  runGoalScheduler,
  saveFewshot,
} from '../api/goal';
import { useBackendHealth } from '../composables/use-backend-health';
import { recommendSelectors, type SelectorCandidate } from '../perception/recommend';

defineOptions({ name: 'AiPerceptionOptimize' });

const health = useBackendHealth();
// S7:统一 reactive 状态(规避 ref 经 setupState 解包链的渲染不同步问题)
const state = reactive({
  goals: [] as PerceptionGoalVO[],
  loading: false,
  running: false,
  summary: [] as Array<Record<string, unknown>>,
});
const goals = computed(() => state.goals);
const loading = computed(() => state.loading);
const running = computed(() => state.running);

const createOpen = ref(false);
const form = reactive({ routePattern: '', goalText: '', pageWeight: 1 });

// S8/F3:草稿审批 + QA 沉淀
const drafts = ref<PerceptionDraftVO[]>([]);
const fewshots = ref<PerceptionFewshotVO[]>([]);
const fewshotForm = reactive({ routePattern: '', question: '', answer: '', score: 5 });
const fewshotAdding = ref(false);

// S9/F4-a:选择器推荐(启发式分析当前页;草稿进审批流,不自动生效)
const candidates = ref<SelectorCandidate[]>([]);
const recommending = ref(false);

async function runRecommend() {
  recommending.value = true;
  try {
    candidates.value = recommendSelectors();
    if (candidates.value.length === 0) message.info('当前页面未找到可推荐的内容区');
  } finally {
    recommending.value = false;
  }
}

async function recommendToDraft(c: SelectorCandidate) {
  await createDraft({
    source: 'recommend',
    payload: JSON.stringify({
      routePattern: location.pathname,
      matchType: 'exact',
      selectors: [c.selector],
      strategy: 'auto',
      description: `选择器推荐:${c.reason}`,
      enabled: true,
    }),
  });
  message.success('推荐草稿已入库,待审批生效');
  await loadS8();
}

async function loadS8() {
  try {
    drafts.value = (await listDrafts('pending')) ?? [];
  } catch {
    drafts.value = [];
  }
  try {
    fewshots.value = (await listFewshots()) ?? [];
  } catch {
    fewshots.value = [];
  }
}

async function approve(d: PerceptionDraftVO) {
  await approveDraft(d.id);
  message.success('草稿已批准,配置生效(ETag 已推进)');
  await Promise.all([loadS8(), loadAll()]);
}

async function reject(d: PerceptionDraftVO) {
  await rejectDraft(d.id, '页面驳回');
  message.success('已拒绝(留痕)');
  await loadS8();
}

async function addFewshot() {
  if (!fewshotForm.routePattern || !fewshotForm.question || !fewshotForm.answer) {
    message.warning('请填写路由/问题/回答');
    return;
  }
  await saveFewshot({ ...fewshotForm, enabled: true });
  message.success('QA 对已沉淀');
  fewshotForm.question = '';
  fewshotForm.answer = '';
  fewshotAdding.value = false;
  await loadS8();
}

async function loadAll() {
  state.loading = true;
  try {
    state.goals = (await listGoals()) ?? [];
    // S7 调试:确认数据到达与赋值时机
    console.info('[perception-optimize] goals loaded:', state.goals.length);
  } catch (err) {
    console.warn('[perception-optimize] loadAll failed:', err);
    message.error('加载感知目标失败');
  }
  // 指标汇总独立容错:失败不清空已取得的目标(部分数据仍可展示)
  try {
    state.summary = (await getMetricsSummary('7d')) ?? [];
  } catch {
    state.summary = [];
  }
  state.loading = false;
}

onMounted(() => {
  if (health.value.state === 'disconnected') return;
  void loadAll();
  void loadS8();
});

async function openCreate() {
  form.routePattern = location.pathname;
  form.goalText = '';
  form.pageWeight = 1;
  createOpen.value = true;
}

async function submitCreate() {
  if (!form.routePattern || !form.goalText) {
    message.warning('请填写路由与目标描述');
    return;
  }
  try {
    await createGoal({ ...form });
    message.success('目标已创建');
    createOpen.value = false;
    await loadAll();
  } catch {
    message.error('创建失败');
  }
}

async function runScheduler() {
  state.running = true;
  try {
    const n = await runGoalScheduler();
    message.success(`调度完成,处理 ${n ?? 0} 个目标`);
    await loadAll();
  } catch {
    message.error('调度失败');
  } finally {
    state.running = false;
  }
}

async function archive(goal: PerceptionGoalVO) {
  await archiveGoal(goal.id);
  message.success('已归档');
  await loadAll();
}

const failRateOf = (row: Record<string, unknown>) => {
  const captures = Number(row.captures ?? 0);
  if (!captures) return '—';
  return `${(((Number(row.fails ?? 0) + Number(row.empties ?? 0)) / captures) * 100).toFixed(0)}%`;
};

const summaryRows = computed(() =>
  state.summary.map((r) => ({
    route: String(r.routePath ?? '—'),
    captures: Number(r.captures ?? 0),
    failRate: failRateOf(r),
    thumbDowns: Number(r.thumbDowns ?? 0),
  })),
);
</script>

<template>
  <!-- 离线占位 -->
  <div
    v-if="health.state === 'disconnected'"
    class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground"
  >
    <div class="text-2xl">⚠</div>
    <div>后端未连接,无法加载感知目标</div>
  </div>

  <div v-else class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold">感知优化 · 目标与验证</span>
        <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {{ goals.length }}/{{ state.goals.length }} 个目标
        </span>
      </div>
      <button
        class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        :disabled="running"
        @click="runScheduler"
      >
        {{ running ? '调度中…' : '运行规则调度' }}
      </button>
    </div>

    <!-- 目标列表 -->
    <div class="min-h-0 flex-1 overflow-auto px-4 py-3">
      <div v-if="goals.length === 0 && !loading" class="py-8 text-center text-[12px] text-muted-foreground">
        暂无目标。规则调度会基于近 7 天度量自动建卡;也可以手工创建。
        <button class="ml-1 text-primary underline" @click="openCreate">手工建卡</button>
      </div>
      <div
        v-for="g in goals"
        :key="g.id"
        class="mb-2 rounded-lg border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-[12px] font-medium">
              <span class="mr-1 rounded bg-primary/10 px-1 text-[10px] text-primary">{{ g.source }}</span>
              {{ g.routePattern }}
            </div>
            <div class="truncate text-[11px] text-muted-foreground" :title="g.goalText">
              {{ g.goalText }}
            </div>
          </div>
          <div class="flex flex-shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
            <span class="rounded bg-muted px-1.5 py-0.5">优先级 {{ Number(g.priority ?? 0).toFixed(1) }}</span>
            <button class="text-red-500 hover:underline" @click="archive(g)">归档</button>
          </div>
        </div>
        <div class="mt-1 flex gap-3 text-[10px] text-muted-foreground">
          <span>未达标 {{ g.failStreak }} 次</span>
          <span>达标 {{ g.passStreak }} 次</span>
        </div>
      </div>

      <!-- S9/F4-a:选择器推荐 -->
      <div class="mt-4">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[11px] font-semibold text-muted-foreground">选择器推荐(当前页启发式)</span>
          <button class="text-[11px] text-primary hover:underline disabled:opacity-50" :disabled="recommending" @click="runRecommend">
            {{ recommending ? '分析中…' : '分析当前页' }}
          </button>
        </div>
        <div
          v-for="c in candidates"
          :key="c.selector"
          class="mb-1 flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-[11px]"
        >
          <div class="min-w-0">
            <code class="text-primary">{{ c.selector }}</code>
            <span class="ml-2 text-muted-foreground">{{ c.reason }}</span>
          </div>
          <button class="flex-shrink-0 text-primary hover:underline" @click="recommendToDraft(c)">
            入库待审
          </button>
        </div>
      </div>

      <!-- S8/F3:草稿审批 -->
      <div v-if="drafts.length" class="mt-4">
        <div class="mb-1 text-[11px] font-semibold text-muted-foreground">待审批配置草稿({{ drafts.length }})</div>
        <div
          v-for="d in drafts"
          :key="d.id"
          class="mb-1 rounded border border-border px-2 py-1.5 text-[11px]"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="truncate text-muted-foreground">{{ d.source }} · {{ d.createTime?.slice(5, 16) }}</span>
            <span class="flex-shrink-0">
              <button class="text-primary hover:underline" @click="approve(d)">批准</button>
              <span class="mx-1 text-border">|</span>
              <button class="text-red-500 hover:underline" @click="reject(d)">拒绝</button>
            </span>
          </div>
          <div class="truncate font-mono text-[10px] text-muted-foreground/70" :title="d.payload">{{ d.payload }}</div>
        </div>
      </div>

      <!-- S8/F3:QA 沉淀 -->
      <div class="mt-4">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[11px] font-semibold text-muted-foreground">相似问答沉淀({{ fewshots.length }})</span>
          <button class="text-[11px] text-primary hover:underline" @click="fewshotAdding = !fewshotAdding">
            {{ fewshotAdding ? '收起' : '+ 沉淀 QA 对' }}
          </button>
        </div>
        <div v-if="fewshotAdding" class="mb-2 rounded border border-border px-2 py-2">
          <input
            v-model="fewshotForm.routePattern"
            placeholder="适用路由,如 /gateway"
            class="mb-1 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
          />
          <input
            v-model="fewshotForm.question"
            placeholder="问:该页面典型问题"
            class="mb-1 w-full rounded border border-border bg-background px-2 py-1 text-[11px]"
          />
          <textarea
            v-model="fewshotForm.answer"
            placeholder="答:高质量回答(将作为相似问答注入 prompt)"
            class="mb-1 h-12 w-full resize-none rounded border border-border bg-background px-2 py-1 text-[11px]"
          />
          <button class="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground" @click="addFewshot">
            保存
          </button>
        </div>
        <div
          v-for="f in fewshots"
          :key="f.id"
          class="mb-1 flex items-start justify-between gap-2 rounded border border-border px-2 py-1 text-[11px]"
        >
          <div class="min-w-0">
            <div class="truncate"><span class="text-primary">{{ f.routePattern }}</span> {{ f.question }}</div>
            <div class="truncate text-muted-foreground" :title="f.answer">{{ f.answer }}</div>
          </div>
          <button class="flex-shrink-0 text-red-500 hover:underline" @click="removeFewshot(f.id).then(loadS8)">删</button>
        </div>
      </div>

      <!-- F1 指标汇总 -->
      <div v-if="summaryRows.length" class="mt-4">
        <div class="mb-1 text-[11px] font-semibold text-muted-foreground">近 7 天采集指标(按路由)</div>
        <div
          v-for="row in summaryRows"
          :key="row.route"
          class="mb-1 flex items-center justify-between rounded border border-border px-2 py-1 text-[11px]"
        >
          <span class="truncate">{{ row.route }}</span>
          <span class="flex-shrink-0 text-muted-foreground">
            采集 {{ row.captures }} · 失败率 {{ row.failRate }} · 点踩 {{ row.thumbDowns }}
          </span>
        </div>
      </div>
    </div>

    <!-- 建卡弹层(简化:复用内联表单) -->
    <div v-if="createOpen" class="border-t border-border bg-background px-4 py-3">
      <div class="mb-2 text-[12px] font-medium">新建目标</div>
      <input
        v-model="form.routePattern"
        placeholder="路由,如 /gateway"
        class="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
      />
      <textarea
        v-model="form.goalText"
        placeholder="目标:该页面 AI 应能回答什么?如「准确回答当前供应商列表的状态分布」"
        class="mb-2 h-16 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
      />
      <div class="flex justify-end gap-2">
        <button class="rounded-md border border-border px-3 py-1 text-[12px]" @click="createOpen = false">
          取消
        </button>
        <button
          class="rounded-md bg-primary px-3 py-1 text-[12px] text-primary-foreground"
          @click="submitCreate"
        >
          创建
        </button>
      </div>
    </div>
    <button v-else class="border-t border-border px-4 py-2 text-left text-[11px] text-muted-foreground hover:text-primary" @click="openCreate">
      + 手工建卡
    </button>
  </div>
</template>
