<script lang="ts" setup>
import { createIconifyIcon } from '../providers/icons';

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import type {
  AgentRunStatus,
  ChatMessage,
  DiffAction,
  ToolApprovalRequest,
  ToolStatus,
} from '../types';

import { renderMarkdown } from './markdown';
import { downloadArtifact } from '../api/chat';
import { fetchHeadMeta } from '../api/client';
import { message as antMessage } from 'ant-design-vue';
import { getToolRenderer } from './tool-renderers';
import { h } from 'vue';
import DiffBlock from './diff-block.vue';
import SqlResultTable from '../modules/sql-result-table.vue';

defineOptions({ name: 'AiMessageItem' });

const props = defineProps<{
  message: ChatMessage;
  /** T14：上一条消息时间（时间分隔线判定用） */
  prevCreatedAt?: number;
}>();
const emit = defineEmits<{
  retry: [];
  /** S6/F1:回答反馈(👍/👎 + 可选标签) */
  feedback: [payload: { messageId: string; result: 'thumb_down' | 'thumb_up'; label?: string }];
  /** Diff 审批动作 */
  diffAction: [payload: { messageId: string; patchId: string; action: DiffAction; lineIndex?: number }];
  /** 工具审批动作 */
  toolApproval: [payload: { messageId: string; approvalId: string; approved: boolean }];
  /** T20：授权并始终允许（写 once/never 策略由后端语义决定） */
  toolAlwaysAllow: [payload: { messageId: string; approvalId: string; serverName?: string; toolName: string }];
  /** T3：打开智能体路径诊断窗口 */
  openTrace: [payload: { messageId: string }];
  /** T14：超过最大迭代后的「继续」请求 */
  continueRun: [];
}>();

// S6/F1:反馈选择(本地态;上报由父组件 trackMetric 完成)
const feedbackPicked = ref<'thumb_down' | 'thumb_up' | null>(null);
function pickFeedback(result: 'thumb_down' | 'thumb_up'): void {
  feedbackPicked.value = result;
  emit('feedback', { messageId: props.message.id, result });
}

const CheckIcon = createIconifyIcon('lucide:check');
const LoaderIcon = createIconifyIcon('lucide:loader');
const XIcon = createIconifyIcon('lucide:x');
const ShieldIcon = createIconifyIcon('lucide:shield-alert');
const CopyIcon = createIconifyIcon('lucide:copy');
const RefreshIcon = createIconifyIcon('lucide:rotate-ccw');
const AlertIcon = createIconifyIcon('lucide:alert-triangle');
const BotIcon = createIconifyIcon('lucide:bot');
const TerminalIcon = createIconifyIcon('lucide:terminal');
const DocIcon = createIconifyIcon('lucide:file-text');
const DbIcon = createIconifyIcon('lucide:database');
const PageIcon = createIconifyIcon('lucide:monitor');
const ChevronIcon = createIconifyIcon('lucide:chevron-down');

const isUser = computed(() => props.message.role === 'user');
const isAssistant = computed(() => props.message.role === 'assistant');
const streaming = computed(() => props.message.status === 'streaming');
const pending = computed(() => props.message.status === 'pending');
const html = computed(() => renderMarkdown(props.message.content));

/** md-body 引用：产物链接文本补全（渲染后异步读响应头文件名） */
const mdBodyRef = ref<HTMLElement | null>(null);

/** 把「下载产物」链接文本替换为真实文件名（HEAD 读 Content-Disposition，带后缀） */
async function fillArtifactLinkNames(): Promise<void> {
  await nextTick();
  const body = mdBodyRef.value;
  if (!body) return;
  const links = Array.from(
    body.querySelectorAll<HTMLAnchorElement>('a[href*="/ai-api/chat/artifacts/"]'),
  );
  for (const a of links) {
    if (a.dataset.nameFilled) continue;
    const id = a.getAttribute('href')?.match(/artifacts\/(\d+)\/download/)?.[1];
    if (!id) continue;
    try {
      const headers = await fetchHeadMeta(`/chat/artifacts/${id}/download`);
      const cd = headers['content-disposition'] ?? '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
      if (m?.[1]) {
        a.textContent = decodeURIComponent(m[1]);
        a.dataset.nameFilled = '1';
      }
    } catch {
      // 无权限/后端不可达：保持「下载产物」占位文本
    }
  }
}

// 消息内容更新（流式/历史加载）后补全链接文件名；immediate 覆盖首次渲染
watch(html, () => void fillArtifactLinkNames(), { immediate: true });
// onMounted：immediate watch 触发时组件未挂载（nextTick 提前 resolve），挂载后补一次
onMounted(() => void fillArtifactLinkNames());

/** T13：产物列表（消息级 + 工具解析产物） */
const artifacts = computed(() => props.message.artifacts ?? []);

/** 随消息上行的附件（历史消息渲染附件 chip） */
const messageAttachments = computed(() => props.message.attachments ?? []);

/** 附件下载（fetchBlob 鉴权） */
async function onAttachmentDownload(att: { id: string; fileName?: string }) {
  try {
    await downloadArtifact(att.id, att.fileName);
  } catch {
    // 下载失败（无权限/过期）：静默，控制台可见
  }
}

/** T13：附件解析状态文案 */
const attachmentStatusText = computed(() => {
  const s = props.message.attachmentStatus;
  if (!s) return '';
  if (s.status === 'parsing') return '解析中…';
  if (s.status === 'indexed') return `已入库知识库${s.docId ? `（文档 ${s.docId}）` : ''}`;
  if (s.status === 'ready') return `完成${s.ocrUsed ? `（OCR ${s.pages ?? 0} 页）` : ''}`;
  if (s.status === 'failed') return `失败${s.error ? `：${s.error}` : ''}`;
  return s.status;
});

/** T13：鉴权下载产物 */
async function onDownload(a: { artifactId: string; fileName?: string }) {
  try {
    await downloadArtifact(a.artifactId, a.fileName);
  } catch (e: any) {
    antMessage.error(`下载失败: ${e?.message ?? '未知错误'}`);
  }
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

// ===== T14-U13：思考折叠块（流式展开 + 0.1s 精度计时；完成后自动折叠） =====
const reasoningOpen = ref(true);
const nowTick = ref(Date.now());
let reasonTimer: ReturnType<typeof setInterval> | undefined;
const reasoningLive = computed(() => {
  // 流式期实时耗时（毫秒）：优先用已固化的 reasoningMs
  if (props.message.reasoningMs) return props.message.reasoningMs;
  if (props.message.reasoningStartTs && props.message.reasoning) {
    return nowTick.value - props.message.reasoningStartTs;
  }
  return 0;
});
const reasoningDone = computed(() => !!props.message.reasoningMs);
const reasoningSecondsLabel = computed(() => {
  const s = reasoningLive.value / 1000;
  return s >= 10 ? `${Math.round(s)} 秒` : `${s.toFixed(1)} 秒`;
});
const reasoningLabel = computed(() => {
  if (streaming.value) {
    return reasoningLive.value ? `思考中… ${reasoningSecondsLabel.value}` : '思考中…';
  }
  // 无计时信息（如刷新后的历史消息）不显示误导性 0 秒
  return reasoningLive.value ? `思考 ${reasoningSecondsLabel.value}` : '思考过程';
});
watch(
  () => [props.message.status, props.message.reasoning] as const,
  ([status, reasoning]) => {
    const active = status === 'streaming' && !!reasoning;
    if (active && !reasonTimer) {
      reasoningOpen.value = true;
      reasonTimer = setInterval(() => {
        nowTick.value = Date.now();
      }, 100);
    }
    if (!active) {
      if (reasonTimer) clearInterval(reasonTimer);
      reasonTimer = undefined;
      if (reasoning && status !== 'streaming' && status !== 'pending') {
        reasoningOpen.value = false; // 完成即折叠
      }
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (reasonTimer) clearInterval(reasonTimer);
});

// ===== T14-U14：流式跳秒徽章 =====
const elapsedSec = ref(0);
let elapsedTimer: ReturnType<typeof setInterval> | undefined;
watch(
  () => props.message.status,
  (s) => {
    if (s === 'streaming') {
      elapsedTimer = setInterval(() => {
        elapsedSec.value += 1;
      }, 1000);
    } else if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = undefined;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (elapsedTimer) clearInterval(elapsedTimer);
});

// ===== T14-U15：时间分隔线（与上一条消息间隔 >10 分钟） =====
const TEN_MIN = 10 * 60 * 1000;
const showTimeSeparator = computed(() => {
  const cur = Number(props.message.createdAt);
  const prev = Number(props.prevCreatedAt);
  if (!cur || !prev) return false;
  return cur - prev > TEN_MIN;
});
const separatorLabel = computed(() => {
  const d = new Date(Number(props.message.createdAt));
  const today = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === today.toDateString()
    ? hm
    : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
});

// ===== T14-U18：超限继续 =====
function onContinueRun() {
  emit('continueRun');
}

const expandedMap = reactive<Record<string, boolean>>({});
function toggle(id: string) {
  expandedMap[id] = !expandedMap[id];
}

// 注册了自定义渲染器的工具调用自动展开（如 xhs_collect_hot_posts → 扫码卡片），
// 避免用户必须点开折叠行才能看到结果卡片（T21 渲染器契约）。
// 工具调用 ≥3 时整组默认折叠（toolGroupOpen），存在注册渲染器时一并展开分组。
function autoExpandRenderedToolCalls() {
  let opened = false;
  for (const tc of props.message.toolCalls ?? []) {
    if (getToolRenderer(tc.name) && !expandedMap[tc.id]) {
      expandedMap[tc.id] = true;
      opened = true;
    }
  }
  if (opened) {
    toolGroupOpen.value = true;
  }
}
watch(
  () => props.message.toolCalls,
  () => nextTick(autoExpandRenderedToolCalls),
  { immediate: true },
);

/** T6-U1：代码块复制（事件委托——markdown 为 v-html 字符串，无法逐按钮绑定） */
async function onMdBodyClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  // 产物下载链接：拦截默认导航（a 标签 GET 不带鉴权头），走 fetchBlob 鉴权下载
  const link = target?.closest?.('a[href*="/ai-api/chat/artifacts/"]') as HTMLAnchorElement | null;
  if (link) {
    e.preventDefault();
    const m = link.getAttribute('href')?.match(/artifacts\/(\d+)\/download/);
    if (m?.[1]) {
      try {
        // 链接文本已补全为真实文件名（含后缀），优先作为下载名；
        // CORS preflight 缓存可能导致响应头 Content-Disposition 不可读
        const fileName = link.innerText.trim() || undefined;
        await downloadArtifact(m[1], fileName);
      } catch {
        // 下载失败（无权限/过期）：不打断阅读，浏览器控制台可见
      }
    }
    return;
  }
  const btn = target?.closest?.('.md-code-copy') as HTMLElement | null;
  if (!btn) return;
  const wrap = btn.closest('.md-code-wrap');
  const code = wrap?.querySelector('pre code');
  const text = code?.textContent ?? '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = '已复制';
    btn.classList.add('md-copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('md-copied');
    }, 1200);
  } catch {
    // 剪贴板不可用（非安全上下文/权限拒绝）：静默失败，不打断阅读
  }
}

const TOOL_ICON: Record<ToolStatus, any> = {
  error: XIcon,
  pending_approval: ShieldIcon,
  running: LoaderIcon,
  success: CheckIcon,
};
const TOOL_COLOR: Record<ToolStatus, string> = {
  error: 'text-red-500',
  pending_approval: 'text-amber-500',
  running: 'text-blue-500',
  success: 'text-emerald-500',
};
const TOOL_TEXT: Record<ToolStatus, string> = {
  error: '失败',
  pending_approval: '待授权',
  running: '运行中',
  success: '完成',
};

// ===== T21：工具渲染器解析 =====
function toolRendererFor(name: string) {
  return getToolRenderer(name);
}
function parseToolResult(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

// ===== T14-U12：工具调用分组（≥3 折叠） =====
const toolGroupOpen = ref(false);
const toolCount = computed(() => props.message.toolCalls?.length ?? 0);
const anyToolRunning = computed(() =>
  (props.message.toolCalls ?? []).some((tc) => tc.status === 'running'),
);
const doneTools = computed(
  () => (props.message.toolCalls ?? []).filter((tc) => tc.status === 'success').length,
);

// Agent 状态徽章
const AGENT_PHASE_TEXT: Record<AgentRunStatus['phase'], string> = {
  idle: '空闲',
  planning: '规划中',
  running: '执行中',
  waiting_approval: '等待授权',
  waiting_diff_review: '等待 Diff 审批',
  completed: '已完成',
  error: '错误',
};
const AGENT_PHASE_COLOR: Record<AgentRunStatus['phase'], string> = {
  idle: 'text-muted-foreground',
  planning: 'text-blue-500',
  running: 'text-blue-500',
  waiting_approval: 'text-amber-500',
  waiting_diff_review: 'text-amber-500',
  completed: 'text-emerald-500',
  error: 'text-red-500',
};

// 风险等级样式
const RISK_STYLE: Record<ToolApprovalRequest['risk'], { label: string; class: string }> = {
  low: { label: '低风险', class: 'text-emerald-600 bg-emerald-500/10' },
  medium: { label: '中风险', class: 'text-amber-600 bg-amber-500/10' },
  high: { label: '高风险', class: 'text-red-600 bg-red-500/10' },
};

// 待处理的工具审批（status='pending'）
const pendingApprovals = computed(
  () => props.message.toolApprovals?.filter((a) => a.status === 'pending') ?? [],
);

// ===== T14 尾：确认卡键盘导航（↑↓ 选择 / Enter 授权 / Esc 拒绝） =====
const keyboardSelected = ref(0);
function onApprovalKeydown(e: KeyboardEvent) {
  const n = pendingApprovals.value.length;
  if (!n) return;
  if (e.key === 'ArrowDown') {
    keyboardSelected.value = (keyboardSelected.value + 1) % n;
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    keyboardSelected.value = (keyboardSelected.value - 1 + n) % n;
    e.preventDefault();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const a = pendingApprovals.value[Math.min(keyboardSelected.value, n - 1)];
    if (a) resolveApproval(a, true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    const a = pendingApprovals.value[Math.min(keyboardSelected.value, n - 1)];
    if (a) resolveApproval(a, false);
  }
}

function resolveApproval(a: ToolApprovalRequest, approved: boolean) {
  emit('toolApproval', { messageId: props.message.id, approvalId: a.approvalId, approved });
}

/** T20：授权并始终允许（approvalId 走审批；策略由父级调权限端点写 never） */
function onAlwaysAllow(a: ToolApprovalRequest) {
  emit('toolAlwaysAllow', {
    messageId: props.message.id,
    approvalId: a.approvalId,
    serverName: a.serverName,
    toolName: a.toolName,
  });
}

function onDiffAction(payload: { patchId: string; action: DiffAction; lineIndex?: number }) {
  emit('diffAction', { messageId: props.message.id, ...payload });
}

function onApprove(approval: ToolApprovalRequest) {
  emit('toolApproval', { messageId: props.message.id, approvalId: approval.approvalId, approved: true });
}

function onReject(approval: ToolApprovalRequest) {
  emit('toolApproval', { messageId: props.message.id, approvalId: approval.approvalId, approved: false });
}

// 格式化工具参数展示
function formatArgs(args: Record<string, any>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

// 相似度分数展示（0-1 保留 2 位）
function formatScore(score?: number): string {
  return typeof score === 'number' ? score.toFixed(2) : '';
}

// P1-T7：引用源类型样式（kb=文档 / db=数据库 / perception=当前页面；旧后端无 sourceType 回退 kb）
const REF_SOURCE_ICON: Record<string, any> = { kb: DocIcon, db: DbIcon, perception: PageIcon };
const REF_SOURCE_LABEL: Record<string, string> = {
  kb: '知识库',
  db: '数据库',
  perception: '当前页面',
};

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content);
  } catch {
    // 忽略剪贴板权限失败
  }
}
</script>

<template>
  <div class="msg-row flex gap-2" :class="isUser ? 'flex-row-reverse' : 'flex-row'">
    <!-- T14-U15：时间分隔线（>10 分钟） -->
    <div v-if="showTimeSeparator" class="w-full py-2 text-center">
      <span class="rounded-full bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {{ separatorLabel }}
      </span>
    </div>
    <div
      v-if="isAssistant"
      class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary"
    >
      AI
    </div>

    <div class="flex min-w-0 max-w-[82%] flex-col gap-1.5" :class="isUser ? 'items-end' : 'items-start'">
      <!-- 思考过程（T14-U13：可折叠 + 跳秒 + 流光） -->
      <div
        v-if="message.reasoning && isAssistant"
        class="w-full rounded-md border border-dashed border-border bg-muted/40 text-[12px] text-muted-foreground"
      >
        <button
          type="button"
          class="flex w-full items-center gap-1.5 px-2.5 py-1 font-medium hover:text-foreground"
          @click="reasoningOpen = !reasoningOpen"
        >
          <component
            :is="LoaderIcon"
            class="h-3 w-3"
            :class="streaming ? 'animate-spin text-blue-500' : ''"
          />
          <span :class="streaming ? 'shimmer-text' : ''">
            {{ reasoningLabel }}
          </span>
          <component
            :is="ChevronIcon"
            class="ml-auto h-3 w-3 transition-transform"
            :class="reasoningOpen ? 'rotate-180' : ''"
          />
        </button>
        <div
          v-if="reasoningOpen"
          class="whitespace-pre-wrap border-t border-dashed border-border/60 px-2.5 py-1.5 leading-5"
        >
          {{ message.reasoning }}
        </div>
      </div>

      <!-- 气泡 -->
      <div
        v-if="message.content || streaming"
        class="rounded-[10px] px-3 py-2 text-[13px] leading-5"
        :class="
          isUser
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border border-border bg-card text-foreground'
        "
      >
        <div ref="mdBodyRef" class="md-body" @click="onMdBodyClick" v-html="html" />
        <!-- T13：附件解析状态 -->
        <div
          v-if="message.attachmentStatus"
          class="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          附件解析：{{ attachmentStatusText }}
        </div>
        <!-- T13：AI 产物卡片（鉴权下载） -->
        <div v-if="artifacts.length" class="mt-2 space-y-1.5">
          <div
            v-for="a in artifacts"
            :key="a.artifactId"
            class="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5"
          >
            <span class="min-w-0 flex-1 truncate text-[12px]">{{ a.fileName }}</span>
            <span v-if="a.size" class="flex-shrink-0 text-[10px] text-muted-foreground">
              {{ formatSize(a.size) }}
            </span>
            <button
              class="flex-shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] hover:border-primary/40 hover:text-primary"
              @click.stop="onDownload(a)"
            >
              下载
            </button>
          </div>
        </div>
        <!-- 随消息上行的附件（历史消息渲染附件 chip） -->
        <div v-if="messageAttachments.length" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="att in messageAttachments"
            :key="att.id"
            class="inline-flex max-w-[260px] items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px]"
          >
            <span class="min-w-0 truncate">{{ att.fileName }}</span>
            <button
              class="flex-shrink-0 text-[10px] text-primary hover:underline"
              @click.stop="onAttachmentDownload(att)"
            >
              下载
            </button>
          </span>
        </div>
        <span v-if="streaming" class="cursor-blink">▋</span>
        <!-- T14-U14：流式跳秒徽章 -->
        <span
          v-if="streaming && elapsedSec > 0"
          class="ml-1 inline-block font-mono text-[10px] tabular-nums text-muted-foreground"
        >{{ elapsedSec }}s</span>
      </div>

      <!-- T14-U18：达到最大迭代 → 琥珀提示 + 继续 -->
      <div
        v-if="isAssistant && message.exceedMaxIters"
        class="flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-600"
      >
        <component :is="AlertIcon" class="h-3.5 w-3.5 flex-shrink-0" />
        <span>已达到最大迭代轮次（{{ message.exceedMaxIters }}），模型未给出最终回答</span>
        <button
          type="button"
          class="ml-auto rounded border border-amber-500/50 px-2 py-0.5 font-medium hover:bg-amber-500/10"
          @click="onContinueRun"
        >
          继续
        </button>
      </div>

      <!-- NL2SQL 查询结果（表格/图表，SQL 已脱敏不展示） -->
      <SqlResultTable
        v-if="isAssistant && message.sqlResult"
        :result="message.sqlResult"
        class="mt-2 w-full"
      />

      <!-- RAG 检索引用（T4：多源命中，P1-T7 按源类型分图标；刷新后不保留） -->
      <div
        v-if="isAssistant && message.references?.length"
        class="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
      >
        <span>参考来源</span>
        <span
          v-for="(ref, i) in message.references"
          :key="ref.segmentId ?? i"
          class="flex max-w-[240px] items-center gap-1 truncate rounded border border-border bg-muted/40 px-1.5 py-0.5"
          :title="`${REF_SOURCE_LABEL[ref.sourceType ?? 'kb']} · ${ref.documentName}`"
        >
          <component
            :is="REF_SOURCE_ICON[ref.sourceType ?? 'kb'] ?? DocIcon"
            class="h-3 w-3 flex-shrink-0"
          />
          <span class="truncate">{{ ref.documentName || '未命名文档' }}</span>
          <span v-if="formatScore(ref.score)" class="flex-shrink-0 text-muted-foreground/70">
            {{ formatScore(ref.score) }}
          </span>
        </span>
      </div>

      <!-- P1-T5：反思轮次过程（深度搜索；流式期展开，完成后折叠为摘要） -->
      <div
        v-if="isAssistant && message.reflectionRounds?.length"
        class="text-[11px] text-muted-foreground"
      >
        <template v-if="streaming">
          <div
            v-for="r in message.reflectionRounds"
            :key="r.round"
            class="flex items-center gap-1.5 py-0.5"
          >
            <component :is="LoaderIcon" class="h-3 w-3 animate-spin text-blue-500" />
            <span>深度搜索·第 {{ r.round }} 轮：{{ r.gapQueries?.join('；') }}</span>
          </div>
        </template>
        <div v-else class="flex items-center gap-1 py-0.5">
          <component :is="DocIcon" class="h-3 w-3" />
          <span>深度搜索 {{ message.reflectionRounds.length }} 轮</span>
        </div>
      </div>

      <!-- pending 占位（等待首个 chunk 到达） -->
      <div
        v-else-if="isAssistant && pending"
        class="flex items-center gap-1.5 rounded-[10px] rounded-bl-sm border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground"
      >
        <component :is="LoaderIcon" class="h-3.5 w-3.5 animate-spin" />
        <span>思考中...</span>
      </div>

      <!-- Agent 运行时状态 -->
      <div
        v-if="isAssistant && message.agentStatus"
        class="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-[11px]"
      >
        <component :is="BotIcon" class="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span class="font-medium">Agent</span>
        <span :class="AGENT_PHASE_COLOR[message.agentStatus.phase]">
          {{ AGENT_PHASE_TEXT[message.agentStatus.phase] }}
        </span>
        <span class="text-muted-foreground">
          · 第 {{ message.agentStatus.iteration }}/{{ message.agentStatus.maxIterations }} 轮
        </span>
        <span
          v-if="message.agentStatus.currentTool"
          class="text-muted-foreground"
        >
          · {{ message.agentStatus.currentTool }}
        </span>
        <component
          :is="LoaderIcon"
          v-if="message.agentStatus.phase === 'running' || message.agentStatus.phase === 'planning'"
          class="h-3 w-3 animate-spin text-blue-500"
        />
      </div>

      <!-- Diff 审批块 -->
      <DiffBlock
        v-for="patch in message.diffs"
        :key="patch.id"
        :patch="patch"
        :readonly="patch.status === 'accepted' || patch.status === 'rejected'"
        @action="onDiffAction"
      />

      <!-- 工具审批卡片 -->
      <div
        v-for="(approval, ai) in pendingApprovals"
        :key="approval.approvalId"
        tabindex="0"
        class="w-full overflow-hidden rounded-lg border bg-amber-500/5 text-[12px] outline-none"
        :class="ai === keyboardSelected ? 'border-amber-500 ring-1 ring-amber-500/60' : 'border-amber-500/40'"
        @keydown="onApprovalKeydown"
      >
        <div class="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <component :is="ShieldIcon" class="h-4 w-4 flex-shrink-0 text-amber-600" />
          <span class="font-medium">工具执行授权</span>
          <span class="text-muted-foreground">{{ approval.toolName }}</span>
          <span
            v-if="approval.serverName"
            class="text-muted-foreground"
          >· {{ approval.serverName }}</span>
          <span
            class="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
            :class="RISK_STYLE[approval.risk].class"
          >
            {{ RISK_STYLE[approval.risk].label }}
          </span>
        </div>
        <!-- 风险说明 -->
        <div
          v-if="approval.riskDescription"
          class="flex items-start gap-1.5 border-b border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-700"
        >
          <component :is="AlertIcon" class="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{{ approval.riskDescription }}</span>
        </div>
        <!-- 工具参数 -->
        <div class="px-3 py-2">
          <div class="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <component :is="TerminalIcon" class="h-3 w-3" />
            <span>执行参数</span>
          </div>
          <pre class="overflow-x-auto rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-4">{{ formatArgs(approval.args) }}</pre>
        </div>
        <!-- 审批按钮 -->
        <div class="flex items-center justify-end gap-1.5 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            @click="onReject(approval)"
          >
            <component :is="XIcon" class="h-3 w-3" />
            拒绝
          </button>
          <!-- T20：编号选项 2——授权并始终允许（策略转 never，同工具后续免审批） -->
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-emerald-600/50 bg-transparent px-2.5 py-1 text-[11px] text-emerald-600 transition-colors hover:bg-emerald-600/10"
            @click="onAlwaysAllow(approval)"
          >
            始终允许
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700"
            @click="onApprove(approval)"
          >
            <component :is="CheckIcon" class="h-3 w-3" />
            授权执行
          </button>
        </div>
      </div>

      <!-- 工具调用卡片（T14-U12：≥3 个折叠为分组，摘要行 + 展开明细） -->
      <div
        v-if="toolCount >= 3"
        class="w-full overflow-hidden rounded-lg border border-border bg-card text-[12px]"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent"
          @click="toolGroupOpen = !toolGroupOpen"
        >
          <component
            :is="anyToolRunning ? LoaderIcon : CheckIcon"
            class="h-3.5 w-3.5 flex-shrink-0"
            :class="anyToolRunning ? 'animate-spin text-blue-500' : 'text-emerald-500'"
          />
          <span class="font-medium">执行了 {{ toolCount }} 个工具调用</span>
          <span class="text-muted-foreground">· 完成 {{ doneTools }}</span>
          <component
            :is="ChevronIcon"
            class="ml-auto h-3 w-3 transition-transform"
            :class="toolGroupOpen ? 'rotate-180' : ''"
          />
        </button>
      </div>
      <div v-show="toolCount < 3 || toolGroupOpen" class="w-full space-y-1">
        <div
          v-for="tc in message.toolCalls"
          :key="tc.id"
          class="w-full overflow-hidden rounded-lg border border-border bg-card text-[12px]"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent"
            @click="toggle(tc.id)"
          >
            <component
              :is="TOOL_ICON[tc.status]"
              class="h-3.5 w-3.5 flex-shrink-0"
              :class="[TOOL_COLOR[tc.status], tc.status === 'running' ? 'animate-spin' : '']"
            />
            <span class="font-medium">{{ tc.name }}</span>
            <span v-if="tc.serverName" class="text-muted-foreground">· {{ tc.serverName }}</span>
            <span class="ml-auto flex items-center gap-2">
              <span :class="TOOL_COLOR[tc.status]">
                {{ TOOL_TEXT[tc.status] }}
                <template v-if="tc.duration"> · {{ tc.duration }}ms</template>
              </span>
            </span>
          </button>
          <div v-if="expandedMap[tc.id]" class="space-y-1 border-t border-border bg-background-deep px-3 py-2">
            <div class="flex gap-2">
              <span class="text-muted-foreground">参数</span>
              <code class="break-all text-[11px]">{{ JSON.stringify(tc.args) }}</code>
            </div>
            <div v-if="tc.result" class="flex gap-2">
              <span class="text-muted-foreground">结果</span>
              <!-- T21：注册渲染器优先（如 local_nl2sql → SqlResultTable），否则文本 -->
              <component
                :is="toolRendererFor(tc.name)!"
                v-if="toolRendererFor(tc.name)"
                :result="parseToolResult(tc.result)"
              />
              <span v-else>{{ tc.result }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误 -->
      <div
        v-if="message.status === 'error'"
        class="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[12px] text-red-500"
      >
        <component :is="XIcon" class="h-3.5 w-3.5" />
        <span>{{ message.error || '生成失败' }}</span>
        <button class="ml-1 underline" @click="$emit('retry')">重试</button>
      </div>

      <!-- 操作条（助手消息完成态） -->
      <div
        v-if="isAssistant && message.status === 'complete' && message.content"
        class="flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          :class="feedbackPicked === 'thumb_up' ? 'text-emerald-500' : ''"
          title="回答有帮助"
          @click="pickFeedback('thumb_up')"
        >
          👍
        </button>
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          :class="feedbackPicked === 'thumb_down' ? 'text-red-500' : ''"
          title="AI 未理解页面 / 回答无帮助"
          @click="pickFeedback('thumb_down')"
        >
          👎
        </button>
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          title="查看智能体路径（执行诊断；旧消息无记录时显示缺失提示）"
          @click="$emit('openTrace', { messageId: message.id })"
        >
          智能体路径
        </button>
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          @click="copyContent"
        >
          <component :is="CopyIcon" class="h-3 w-3" /> 复制
        </button>
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-foreground"
          @click="$emit('retry')"
        >
          <component :is="RefreshIcon" class="h-3 w-3" /> 重新生成
        </button>
        <span v-if="message.tokens" class="px-1 text-[11px] text-muted-foreground/70">
          ↑{{ message.tokens.input }} ↓{{ message.tokens.output }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cursor-blink {
  display: inline-block;
  margin-left: 1px;
  animation: blink 1s steps(2, start) infinite;
  color: var(--primary);
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}

.md-body {
  word-break: break-word;
}
.md-body :deep(p) {
  margin: 0 0 6px;
}
.md-body :deep(p:last-child) {
  margin-bottom: 0;
}
.md-body :deep(.md-ul) {
  margin: 4px 0;
  padding-left: 18px;
  list-style: disc;
}
.md-body :deep(.md-ul li) {
  margin: 2px 0;
}
.md-body :deep(.md-inline-code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgb(0 0 0 / 8%);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
}
:global(.ai-theme-dark) .md-body :deep(.md-inline-code) {
  background: rgb(255 255 255 / 10%);
}
.md-body :deep(.md-code-wrap) {
  margin: 6px 0;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  overflow: hidden;
}
.md-body :deep(.md-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: hsl(var(--muted));
  font-size: 11px;
}
.md-body :deep(.md-code-lang) {
  color: hsl(var(--muted-foreground));
  text-transform: lowercase;
}
.md-body :deep(.md-code-copy) {
  cursor: pointer;
  color: hsl(var(--muted-foreground));
}
.md-body :deep(.md-code-copy:hover) {
  color: hsl(var(--foreground));
}
.md-body :deep(.md-code) {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  background: hsl(var(--primary) / 0.03);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 18px;
}
/* T6-U1：复制按钮反馈态 */
.md-body :deep(.md-code-copy.md-copied) {
  color: hsl(var(--primary));
}
/* T6-U1：hljs token 自配色（不引入 hljs 主题 CSS，避免与明暗主题冲突） */
.md-body :deep(.hljs-keyword),
.md-body :deep(.hljs-selector-tag),
.md-body :deep(.hljs-literal),
.md-body :deep(.hljs-section) {
  color: #a626a4;
}
.md-body :deep(.hljs-string),
.md-body :deep(.hljs-attr),
.md-body :deep(.hljs-addition) {
  color: #50a14f;
}
.md-body :deep(.hljs-number),
.md-body :deep(.hljs-symbol),
.md-body :deep(.hljs-bullet),
.md-body :deep(.hljs-meta) {
  color: #986801;
}
.md-body :deep(.hljs-title),
.md-body :deep(.hljs-name),
.md-body :deep(.hljs-function .hljs-title),
.md-body :deep(.hljs-title.function_) {
  color: #4078f2;
}
.md-body :deep(.hljs-comment),
.md-body :deep(.hljs-quote),
.md-body :deep(.hljs-deletion) {
  color: #a0a1a7;
  font-style: italic;
}
:global(.ai-theme-dark) .md-body :deep(.hljs-keyword),
:global(.ai-theme-dark) .md-body :deep(.hljs-selector-tag),
:global(.ai-theme-dark) .md-body :deep(.hljs-literal),
:global(.ai-theme-dark) .md-body :deep(.hljs-section) {
  color: #c678dd;
}
:global(.ai-theme-dark) .md-body :deep(.hljs-string),
:global(.ai-theme-dark) .md-body :deep(.hljs-attr),
:global(.ai-theme-dark) .md-body :deep(.hljs-addition) {
  color: #98c379;
}
:global(.ai-theme-dark) .md-body :deep(.hljs-number),
:global(.ai-theme-dark) .md-body :deep(.hljs-symbol),
:global(.ai-theme-dark) .md-body :deep(.hljs-bullet),
:global(.ai-theme-dark) .md-body :deep(.hljs-meta) {
  color: #d19a66;
}
:global(.ai-theme-dark) .md-body :deep(.hljs-title),
:global(.ai-theme-dark) .md-body :deep(.hljs-name),
:global(.ai-theme-dark) .md-body :deep(.hljs-function .hljs-title),
:global(.ai-theme-dark) .md-body :deep(.hljs-title.function_) {
  color: #61afef;
}
:global(.ai-theme-dark) .md-body :deep(.hljs-comment),
:global(.ai-theme-dark) .md-body :deep(.hljs-quote),
:global(.ai-theme-dark) .md-body :deep(.hljs-deletion) {
  color: #7f848e;
}

/* T14-U13：思考流光 */
.shimmer-text {
  background: linear-gradient(90deg, currentColor 25%, hsl(var(--primary)) 50%, currentColor 75%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  animation: md-shimmer 1.8s linear infinite;
}
@keyframes md-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
</style>