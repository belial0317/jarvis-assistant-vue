<script lang="ts" setup>
import { createIconifyIcon } from '../../providers/icons';

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

import type {
  ChatMessage,
  ChatSession,
  ContextItem,
  DiffAction,
  StreamChunk,
} from '../../types';

import {
  approveDiff,
  listMessages,
  listSessions,
  respondToolApproval,
  saveSession,
  streamMessage,
  stopGenerate,
  summarizeContext,
  toChatMessage,
  type ChatSessionVO,
} from '../../api/chat';
import { listAgents, type AgentVO } from '../../api/agent';
import { listProviders } from '../../api/provider';

import MessageItem from '../../components/message-item.vue';
import {
  buildPageInsight,
  capturePageContext,
  loadPerceptionConfigs,
  type PageInsight,
} from '../../utils/page-context';
import { useBackendHealth } from '../../composables/use-backend-health';
import StatusBar from '../../components/status-bar.vue';
import InputArea from './input-area.vue';
import { useAiAssistantConfig } from '../../providers';

defineOptions({ name: 'AiChatWorkbench' });

defineEmits<{
  /** 通知父级跳转到设置页 */
  'go-settings': [];
}>();

const config = useAiAssistantConfig();

const PlusIcon = createIconifyIcon('lucide:plus');
const HistoryIcon = createIconifyIcon('lucide:history');
const TrashIcon = createIconifyIcon('lucide:trash-2');
const ChevronIcon = createIconifyIcon('lucide:chevron-left');
const BotIcon = createIconifyIcon('lucide:bot');

// ===== 会话管理（真实 API） =====
const sessions = ref<ChatSession[]>([]);
const activeId = ref('');
const activeSession = computed(
  () => sessions.value.find((s) => s.id === activeId.value),
);

const showHistory = ref(false);
const loadingSessions = ref(false);

// ===== 页面感知摘要（空会话时展示，LLM 一句话总结）=====
const pageInsight = ref<PageInsight | null>(null);
const insightLoading = ref(false);
const insightSummary = ref('');
const perceptionStage = ref<'done' | 'extracting' | 'failed' | 'idle' | 'perceiving'>('idle');
const hasMessages = computed(
  () => (activeSession.value?.messages.length ?? 0) > 0,
);

// 用 LLM 感知摘要替代会话标题显示（有摘要时优先）
const displayTitle = computed(() => {
  if (insightSummary.value) {
    return insightSummary.value;
  }
  // 仅在感知过程中显示进度文案；失败时回退到原始标题（不再永远卡在感知状态）
  if (insightLoading.value) {
    return '正在感知内容...';
  }
  return activeSession.value?.title ?? '新会话';
});

let lastSummaryToken = 0;

const health = useBackendHealth();

async function refreshPageInsight() {
  // 空会话才展示 DOM 统计 + hints 面板
  if (hasMessages.value) {
    pageInsight.value = null;
    perceptionStage.value = 'perceiving';
  } else {
    perceptionStage.value = 'extracting';
    pageInsight.value = buildPageInsight(
      config.route?.getRoute().path,
      (config.route?.getRoute().title as string) || undefined,
    );
  }

  // 后端未连通：跳过 summarizeContext 调用，避免 4–5 个并发错误 toast
  if (health.value.state !== 'connected') {
    insightSummary.value = '';
    perceptionStage.value = 'failed';
    insightLoading.value = false;
    return;
  }

  // 不管有无消息，都生成标题摘要（用于替换会话标题）
  let pageContext: string;
  try {
    pageContext = capturePageContext(config.route?.getRoute().path);
  } catch {
    pageContext = '';
  }
  // pageContext 为空时仍尝试请求后端（传路由信息作为 fallback），
  // 避免 capturePageContext 返回空导致 summarizeContext 永不被调用
  const contextForSummary = pageContext || `路由: ${config.route?.getRoute().path}\n页面: ${config.route?.getRoute().title ?? '未知'}`;

  const token = ++lastSummaryToken;
  insightLoading.value = true;
  perceptionStage.value = 'perceiving';
  insightSummary.value = '';
  try {
    // 兜底：15s 超时防止 axios 拦截器异常导致 promise 永久 pending
    const summary = await Promise.race([
      summarizeContext(
        JSON.stringify({ path: config.route?.getRoute().path, title: config.route?.getRoute().title }),
        contextForSummary,
      ),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('summarizeContext timeout after 15s')), 15000),
      ),
    ]);
    if (token !== lastSummaryToken) return;
    insightSummary.value = (summary || '').trim();
    perceptionStage.value = insightSummary.value ? 'done' : 'failed';
  } catch (err) {
    console.warn('[refreshPageInsight] summarizeContext failed:', err);
    if (token !== lastSummaryToken) return;
    insightSummary.value = '';
    perceptionStage.value = 'failed';
  } finally {
    if (token === lastSummaryToken) insightLoading.value = false;
  }
}

watch(
  () => config.route?.getRoute().path,
  () => refreshPageInsight(),
);

// ===== 模型选择（真实 Provider API） =====
// 后端 Provider 为平台级共享（不参与多租户过滤），加载已启用供应商的模型
const modelOptions = ref<Array<{ label: string; value: string }>>([]);

async function loadModelOptions() {
  try {
    const providers = await listProviders({ enabled: true });
    const list: Array<{ label: string; value: string }> = [];
    for (const p of providers) {
      for (const m of p.models ?? []) {
        list.push({ label: m.displayName, value: m.id });
      }
    }
    modelOptions.value = list;
  } catch {
    // 加载失败：保留空列表，用户仍可发消息（后端用默认模型）
    modelOptions.value = [];
  }
}

const currentModelName = computed(() => {
  const mid = activeSession.value?.modelId;
  return modelOptions.value.find((m) => m.value === mid)?.label ?? mid ?? '';
});

function onModelChange(mid: string) {
  if (activeSession.value) {
    activeSession.value.modelId = mid;
    // 持久化模型切换
    if (activeSession.value.id) {
      saveSession({
        id: activeSession.value.id,
        title: activeSession.value.title,
        modelId: mid,
      }).catch(() => {
        // 静默失败：模型切换不影响主流程
      });
    }
  }
}

// ===== Agent 选择（真实 Agent API） =====
// Agent 为平台级共享，加载已启用 Agent 供会话切换。
// 切换 Agent 时不清空当前会话消息（按 P0 任务约定）。
const agents = ref<AgentVO[]>([]);
const showAgentPicker = ref(false);

async function loadAgents() {
  try {
    agents.value = await listAgents({ enabled: true });
  } catch {
    agents.value = [];
  }
}

const currentAgent = computed(
  () => agents.value.find((a) => a.id === activeSession.value?.agentId),
);

function onAgentChange(agentId: string) {
  if (!activeSession.value) return;
  activeSession.value.agentId = agentId;
  showAgentPicker.value = false;
  // 持久化 Agent 切换（不清空消息）
  if (activeSession.value.id) {
    saveSession({
      id: activeSession.value.id,
      title: activeSession.value.title,
      agentId,
      modelId: activeSession.value.modelId,
    }).catch(() => {
      // 静默失败
    });
  }
}

function clearAgent() {
  if (!activeSession.value) return;
  activeSession.value.agentId = undefined;
  showAgentPicker.value = false;
  if (activeSession.value.id) {
    saveSession({
      id: activeSession.value.id,
      title: activeSession.value.title,
      modelId: activeSession.value.modelId,
    }).catch(() => {});
  }
}

/**
 * 使用指定 Agent 开始对话：
 * 切换到该 Agent 关联的会话（若存在则复用，否则创建新会话）。
 * 供父组件通过 ref 调用（如 Agents 管理 → 测试对话）。
 */
async function startChatWithAgent(agentId: string) {
  // 1. 优先复用已存在且使用该 Agent 的会话
  const existing = sessions.value.find((s) => s.agentId === agentId);
  if (existing) {
    await switchSession(existing.id);
    return;
  }
  // 2. 否则新建会话并绑定 Agent
  try {
    const newId = await saveSession({
      title: '新对话',
      agentId,
      modelId: modelOptions.value[0]?.value ?? '',
    });
    // 构造本地会话对象并加入列表
    const session = reactive<ChatSession>({
      id: newId,
      title: '新对话',
      agentId,
      modelId: modelOptions.value[0]?.value ?? '',
      messages: [],
      context: [],
      pinned: false,
      tokenCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    sessions.value.unshift(session);
    await switchSession(newId);
  } catch {
    // 静默失败
  }
}

defineExpose({ startChatWithAgent });

// ===== VO → 前端 ChatSession =====
function voToSession(vo: ChatSessionVO): ChatSession {
  return {
    id: vo.id,
    title: vo.title,
    agentId: vo.agentId,
    modelId: vo.modelId ?? modelOptions.value[0]?.value ?? '',
    messages: [],
    context: [],
    pinned: vo.pinned,
    tokenCount: vo.tokenCount ?? 0,
    createdAt: vo.createdAt,
    updatedAt: vo.updatedAt,
  };
}

/** 加载会话列表 */
async function loadSessions() {
  loadingSessions.value = true;
  try {
    const list = await listSessions({ pageSize: 50 });
    sessions.value = list.map((vo) => reactive(voToSession(vo)));
    if (sessions.value.length > 0 && !activeId.value) {
      activeId.value = sessions.value[0]!.id;
      await loadMessages(activeId.value);
    }
  } catch {
    // 加载失败：不阻塞 UI，保留空列表
    sessions.value = [];
  } finally {
    loadingSessions.value = false;
  }
}

/** 加载某会话的消息列表 */
async function loadMessages(sessionId: string) {
  const session = sessions.value.find((s) => s.id === sessionId);
  if (!session) return;
  try {
    const messages = await listMessages(sessionId);
    session.messages = messages.map(toChatMessage);
  } catch {
    session.messages = [];
  }
}

/** 新建会话 */
async function startNewSession() {
  try {
    const title = '新会话';
    const id = await saveSession({ title });
    const session = reactive<ChatSession>({
      id,
      title,
      modelId: modelOptions.value[0]?.value ?? '',
      messages: [],
      context: [],
      tokenCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    sessions.value.unshift(session);
    activeId.value = id;
    showHistory.value = false;
    scrollToBottom();
    refreshPageInsight();
  } catch {
    // 创建失败：保留在当前会话
  }
}

/** 切换会话 */
async function switchSession(id: string) {
  activeId.value = id;
  showHistory.value = false;
  await loadMessages(id);
  scrollToBottom();
  refreshPageInsight();
}

/** 删除会话 */
async function deleteSession(id: string) {
  const idx = sessions.value.findIndex((s) => s.id === id);
  if (idx < 0) return;
  try {
    await stopIfGenerating(id);
    // 乐观删除
    sessions.value.splice(idx, 1);
    if (activeId.value === id) {
      activeId.value = sessions.value[0]?.id ?? '';
      if (!activeId.value) {
        await startNewSession();
      } else {
        await loadMessages(activeId.value);
      }
    }
    // 后端清理（静默）
    import('../../api/chat').then((m) => m.deleteSession(id)).catch(() => {});
  } catch {
    // 失败不恢复：用户已感知删除
  }
}

async function stopIfGenerating(sessionId: string) {
  if (loading.value && activeId.value === sessionId) {
    await stopGenerate(sessionId).catch(() => {});
    onStop();
  }
}

// ===== 流式对话（真实 SSE API） =====
const loading = ref(false);
let abortController: AbortController | null = null;
const scrollRef = ref<HTMLDivElement>();

const messages = computed(() => activeSession.value?.messages ?? []);

function scrollToBottom(smooth = false) {
  nextTick(() => {
    const el = scrollRef.value;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  });
}

async function onSend(text: string) {
  pageInsight.value = null;
  insightSummary.value = '';
  perceptionStage.value = 'idle';
  let session = activeSession.value;
  if (!session) {
    await startNewSession();
    session = activeSession.value;
    if (!session) return;
  }

  // 用户消息乐观插入
  const userMsg: ChatMessage = {
    id: `local-u-${Date.now()}`,
    role: 'user',
    content: text,
    status: 'complete',
    tokens: { input: text.length, output: 0 },
    createdAt: Date.now(),
  };
  // assistant 占位消息
  const assistantMsg: ChatMessage = {
    id: `local-a-${Date.now()}`,
    role: 'assistant',
    content: '',
    status: 'pending',
    createdAt: Date.now(),
  };
  session.messages.push(userMsg, assistantMsg);
  // 关键：push 后从响应式数组取回 reactive proxy 引用。
  // 直接通过原始 assistantMsg 修改属性不会触发 Vue 响应式更新（原始对象不走 Proxy set trap），
  // 会导致 streaming 过程中 UI 不刷新，只在 loading 变化时一次性渲染最终结果。
  const reactiveAssistant = session.messages[session.messages.length - 1]!;
  session.updatedAt = Date.now();
  scrollToBottom();

  loading.value = true;
  abortController = new AbortController();

  try {
    const currentRoute = JSON.stringify({
      path: config.route?.getRoute().path,
      name: String(config.route?.getRoute().name ?? ''),
      title: (config.route?.getRoute().title as string) ?? '',
    });
    const pageContext = capturePageContext(config.route?.getRoute().path);

    await streamMessage(
      session.id,
      { agentId: session.agentId, content: text, currentRoute, pageContext },
      (chunk: StreamChunk) => {
        switch (chunk.type) {
          case 'reasoning': {
            reactiveAssistant.reasoning = (reactiveAssistant.reasoning ?? '') + (chunk.text ?? '');
            break;
          }
          case 'delta': {
            if (reactiveAssistant.status === 'pending') {
              reactiveAssistant.status = 'streaming';
            }
            reactiveAssistant.content += chunk.text ?? '';
            scrollToBottom();
            break;
          }
          case 'replace': {
            // 后端正则脱敏后替换全部内容（安全兜底）
            reactiveAssistant.content = chunk.text ?? '';
            scrollToBottom();
            break;
          }
          case 'diff': {
            if (chunk.diff) {
              // 关联消息 ID，便于审批回调定位
              chunk.diff.messageId = reactiveAssistant.id;
              if (!reactiveAssistant.diffs) {
                reactiveAssistant.diffs = [];
              }
              reactiveAssistant.diffs.push(chunk.diff);
              scrollToBottom();
            }
            break;
          }
          case 'tool_approval': {
            if (chunk.toolApproval) {
              if (!reactiveAssistant.toolApprovals) {
                reactiveAssistant.toolApprovals = [];
              }
              reactiveAssistant.toolApprovals.push(chunk.toolApproval);
              scrollToBottom();
            }
            break;
          }
          case 'tool_call': {
            if (chunk.toolCall) {
              if (!reactiveAssistant.toolCalls) {
                reactiveAssistant.toolCalls = [];
              }
              reactiveAssistant.toolCalls.push(chunk.toolCall);
              scrollToBottom();
            }
            break;
          }
          case 'tool_result': {
            // 更新对应 toolCall 的结果和状态
            if (chunk.toolCall && reactiveAssistant.toolCalls) {
              const tc = reactiveAssistant.toolCalls.find(
                (t) => t.id === chunk.toolCall!.id,
              );
              if (tc) {
                tc.result = chunk.toolCall.result;
                tc.status = chunk.toolCall.status;
                tc.duration = chunk.toolCall.duration;
              }
            }
            break;
          }
          case 'agent_status': {
            if (chunk.agentStatus) {
              reactiveAssistant.agentStatus = chunk.agentStatus;
              scrollToBottom();
            }
            break;
          }
          case 'nl2sql_result': {
            if (chunk.sqlResult) {
              reactiveAssistant.sqlResult = chunk.sqlResult;
              scrollToBottom();
            }
            break;
          }
          case 'done': {
            reactiveAssistant.status = 'complete';
            reactiveAssistant.tokens = {
              input: userMsg.tokens?.input ?? 0,
              output: reactiveAssistant.content.length,
            };
            break;
          }
          case 'error': {
            reactiveAssistant.status = 'error';
            reactiveAssistant.error = chunk.error ?? '未知错误';
            break;
          }
        }
      },
      abortController.signal,
    );
    session.tokenCount +=
      userMsg.content.length + reactiveAssistant.content.length;
  } catch (err: any) {
    // AbortError 是用户主动中断，不视为错误
    if (err?.name === 'AbortError') {
      if (reactiveAssistant.status !== 'complete') {
        reactiveAssistant.status = 'stopped';
      }
    } else {
      reactiveAssistant.status = 'error';
      reactiveAssistant.error = err?.message ?? '请求中断';
    }
  } finally {
    loading.value = false;
    abortController = null;
    scrollToBottom(true);
  }
}

function onStop() {
  abortController?.abort();
}

// ===== Diff 审批处理 =====
async function onDiffAction(payload: {
  messageId: string;
  patchId: string;
  action: DiffAction;
  lineIndex?: number;
}) {
  const session = activeSession.value;
  if (!session) return;
  const msg = session.messages.find((m) => m.id === payload.messageId);
  if (!msg?.diffs) return;
  const patch = msg.diffs.find((d) => d.id === payload.patchId);
  if (!patch) return;

  // 更新本地 patch 状态
  if (payload.action === 'accept') {
    patch.status = 'accepted';
    patch.lineDecisions = {};
    for (const line of patch.lines) {
      if (line.type !== 'context') patch.lineDecisions[line.index] = true;
    }
  } else if (payload.action === 'reject') {
    patch.status = 'rejected';
    patch.lineDecisions = {};
    for (const line of patch.lines) {
      if (line.type !== 'context') patch.lineDecisions[line.index] = false;
    }
  } else if (payload.action === 'accept_line' && payload.lineIndex !== undefined) {
    if (!patch.lineDecisions) patch.lineDecisions = {};
    patch.lineDecisions[payload.lineIndex] = true;
    // 检查是否所有行都已决策
    const actionable = patch.lines.filter((l) => l.type !== 'context');
    const allDecided = actionable.every((l) => l.index in patch.lineDecisions!);
    if (allDecided) {
      patch.status = 'partial';
    }
  } else if (payload.action === 'reject_line' && payload.lineIndex !== undefined) {
    if (!patch.lineDecisions) patch.lineDecisions = {};
    patch.lineDecisions[payload.lineIndex] = false;
    const actionable = patch.lines.filter((l) => l.type !== 'context');
    const allDecided = actionable.every((l) => l.index in patch.lineDecisions!);
    if (allDecided) {
      patch.status = 'partial';
    }
  }

  // 调用后端接口持久化审批结果
  await approveDiff(session.id, payload.patchId, {
    action: payload.action,
    lineIndex: payload.lineIndex,
  }).catch((err) => {
    // 后端失败时回滚本地状态为 pending
    patch.status = 'pending';
    patch.error = err?.message ?? '审批提交失败';
  });
}

// ===== 工具审批处理 =====
async function onToolApproval(payload: {
  messageId: string;
  approvalId: string;
  approved: boolean;
}) {
  const session = activeSession.value;
  if (!session) return;
  const msg = session.messages.find((m) => m.id === payload.messageId);
  if (!msg?.toolApprovals) return;
  const approval = msg.toolApprovals.find(
    (a) => a.approvalId === payload.approvalId,
  );
  if (!approval) return;

  // 更新本地审批状态
  approval.status = payload.approved ? 'approved' : 'rejected';

  // 调用后端接口传递审批结果
  await respondToolApproval(
    session.id,
    payload.approvalId,
    payload.approved,
  ).catch((err) => {
    // 后端失败时回滚本地状态为 pending
    approval.status = 'pending';
    approval.riskDescription = err?.message ?? '审批提交失败，请重试';
  });
}

async function onRetry() {
  const session = activeSession.value;
  if (!session) return;
  const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return;
  const last = session.messages[session.messages.length - 1];
  if (last?.role === 'assistant') {
    session.messages.pop();
  }
  await onSend(lastUser.content);
}

// ===== 上下文引用 =====
const context = ref<ContextItem[]>([]);

function onContextChange(items: ContextItem[]) {
  context.value = items;
  if (activeSession.value) {
    activeSession.value.context = items;
  }
}

// ===== 初始化 =====
onMounted(async () => {
  // 后端未连通：跳过全部 API 调用，由顶部 banner 提示用户
  if (health.value.state === 'disconnected') {
    return;
  }
  // 并行加载模型选项 + Agent 列表 + 会话列表 + 感知配置
  await Promise.all([
    loadModelOptions(),
    loadAgents(),
    loadSessions(),
    loadPerceptionConfigs(),
  ]);
  if (sessions.value.length === 0) {
    await startNewSession();
  } else {
    scrollToBottom();
  }
  refreshPageInsight();
});
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- 会话历史侧栏 -->
    <transition name="slide-fade">
      <aside
        v-if="showHistory"
        class="flex w-[200px] flex-shrink-0 flex-col border-r border-border bg-background-deep"
      >
        <div class="flex items-center justify-between px-3 py-2.5">
          <span class="text-[12px] font-medium">会话历史</span>
          <button
            class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="showHistory = false"
          >
            <component :is="ChevronIcon" class="h-4 w-4" />
          </button>
        </div>
        <div class="px-2 pb-2">
          <button
            class="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[12px] text-muted-foreground hover:border-primary/40 hover:text-primary"
            @click="startNewSession"
          >
            <component :is="PlusIcon" class="h-3.5 w-3.5" />
            新建会话
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
          <div
            v-if="loadingSessions"
            class="px-2 py-3 text-center text-[11px] text-muted-foreground"
          >
            加载中...
          </div>
          <div
            v-for="s in sessions"
            :key="s.id"
            role="button"
            tabindex="0"
            class="group relative mb-1 w-full cursor-pointer rounded-md px-2 py-2 text-left text-[12px] transition-colors"
            :class="
              s.id === activeId
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-accent'
            "
            @click="switchSession(s.id)"
            @keydown.enter="switchSession(s.id)"
          >
            <div class="truncate font-medium">
              {{ (s.id === activeId && insightLoading && !insightSummary) ? '正在感知内容...' : s.title }}
            </div>
            <div class="mt-0.5 truncate text-[10px] text-muted-foreground">
              {{ s.messages.length }} 条 ·
              {{ (s.tokenCount / 1000).toFixed(1) }}k tokens
            </div>
            <button
              type="button"
              class="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500 group-hover:flex"
              @click.stop="deleteSession(s.id)"
            >
              <component :is="TrashIcon" class="h-3 w-3" />
            </button>
          </div>
        </div>
      </aside>
    </transition>

    <!-- 主区 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 工具栏 -->
      <div
        class="flex h-[38px] flex-shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      >
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          :class="showHistory ? 'bg-accent text-foreground' : ''"
          aria-label="会话历史"
          @click="showHistory = !showHistory"
        >
          <component :is="HistoryIcon" class="h-4 w-4" />
        </button>
        <button
          class="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          @click="startNewSession"
        >
          <component :is="PlusIcon" class="h-3.5 w-3.5" />
          新会话
        </button>
        <div
          class="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]"
          :title="displayTitle"
        >
          <span
            v-if="insightLoading && !insightSummary"
            class="inline-flex items-center gap-1.5 text-amber-500"
          >
            <span class="inline-flex gap-0.5">
              <span class="h-1 w-1 animate-pulse rounded-full bg-current" />
              <span class="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span class="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
            正在感知内容...
          </span>
          <template v-else>
            <span
              v-if="insightSummary"
              class="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500"
            />
            <span
              class="truncate font-medium"
              :class="insightSummary ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'"
            >{{ displayTitle }}</span>
          </template>
        </div>
        <!-- Agent 切换器 -->
        <div class="relative flex-shrink-0">
          <button
            class="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[12px] transition-colors hover:bg-accent"
            :class="currentAgent ? 'border-primary/40 text-primary' : 'text-muted-foreground'"
            :title="currentAgent ? `当前 Agent: ${currentAgent.name}` : '选择 Agent'"
            @click="showAgentPicker = !showAgentPicker"
          >
            <component :is="BotIcon" class="h-3.5 w-3.5" />
            <span class="max-w-[100px] truncate">
              {{ currentAgent?.name ?? '默认模式' }}
            </span>
          </button>
          <!-- Agent 下拉选择 -->
          <div
            v-if="showAgentPicker"
            class="absolute right-0 top-full z-10 mt-1 w-[240px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          >
            <div class="px-2.5 py-1.5 text-[11px] text-muted-foreground">
              选择 Agent（切换不清空消息）
            </div>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
              :class="!activeSession?.agentId ? 'bg-accent text-primary' : ''"
              @click="clearAgent"
            >
              <div class="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px]">AI</div>
              <div class="min-w-0 flex-1">
                <div class="font-medium">默认模式</div>
                <div class="truncate text-[10px] text-muted-foreground">不使用 Agent，纯对话</div>
              </div>
            </button>
            <button
              v-for="agent in agents"
              :key="agent.id"
              type="button"
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
              :class="agent.id === activeSession?.agentId ? 'bg-accent text-primary' : ''"
              @click="onAgentChange(agent.id)"
            >
              <div
                class="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                :style="{ backgroundColor: (agent.color ?? '#3b82f6') + '20', color: agent.color ?? '#3b82f6' }"
              >
                {{ agent.avatar || agent.name.charAt(0) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ agent.name }}</div>
                <div class="truncate text-[10px] text-muted-foreground">{{ agent.description }}</div>
              </div>
              <span v-if="agent.strategy === 'react'" class="rounded bg-muted px-1 text-[9px] text-muted-foreground">ReAct</span>
            </button>
            <div v-if="agents.length === 0" class="px-2.5 py-2 text-center text-[11px] text-muted-foreground">
              暂无可用 Agent
            </div>
          </div>
        </div>
      </div>

      <!-- 消息流 -->
      <div
        ref="scrollRef"
        class="group min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4"
      >
        <!-- 后端未连通：覆盖整屏的友好提示（顶 banner 已说明，这里再二次确认） -->
        <div
          v-if="health.state === 'disconnected' && messages.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <div
            class="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-lg font-medium text-red-500"
          >
            ⚠
          </div>
          <div class="text-[14px] font-medium">AI 后端未连通</div>
          <div class="text-[12px] leading-5 text-muted-foreground">
            请前往
            <button class="text-primary underline-offset-2 hover:underline" @click="$emit('go-settings')">
              设置 → 后端服务
            </button>
            配置服务地址后重试
          </div>
        </div>

        <template v-if="messages.length === 0 && health.state !== 'disconnected'">
          <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-lg font-medium text-primary"
            >
              AI
            </div>
            <div v-if="pageInsight" class="flex w-full flex-col items-center gap-1.5">
              <div class="flex items-center gap-1.5 text-[14px] font-medium">
                <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {{ pageInsight.description }}
              </div>
              <!-- LLM 一句话摘要（loading / 截断显示） -->
              <div class="max-w-[360px] text-[13px] leading-5">
                <span
                  v-if="insightLoading && !insightSummary"
                  class="inline-flex items-center gap-1 text-amber-500"
                >
                  <span class="inline-flex gap-0.5">
                    <span class="h-1 w-1 animate-pulse rounded-full bg-current" />
                    <span class="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
                    <span class="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
                  </span>
                  正在感知内容...
                </span>
                <span
                  v-else-if="insightSummary"
                  class="block truncate font-medium text-primary"
                  :title="insightSummary"
                >{{ insightSummary }}</span>
                <span v-else class="inline-flex items-center gap-1 text-muted-foreground">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已自动感知当前页面，直接提问即可基于上下文对话
                </span>
                <!-- 感知进度条（仅感知中显示；感知失败由兜底文案替代） -->
                <div
                  v-if="insightLoading && !insightSummary"
                  class="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-muted"
                >
                  <div class="h-full w-1/2 rounded-full bg-amber-500 transition-all duration-500" />
                </div>
              </div>
            </div>
            <div v-else class="text-[14px] font-medium">开始一段新对话</div>
            <div class="mt-2 flex flex-wrap justify-center gap-2">
              <button
                v-for="hint in (pageInsight?.hints ?? ['你好', '介绍下 Spring AI', '写一个快速排序'])"
                :key="hint"
                class="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                @click="onSend(hint)"
              >
                {{ hint }}
              </button>
            </div>
          </div>
        </template>
        <template v-else>
          <MessageItem
            v-for="msg in messages"
            :key="msg.id"
            :message="msg"
            class="group"
            @retry="onRetry"
            @diff-action="onDiffAction"
            @tool-approval="onToolApproval"
          />
        </template>
      </div>

      <!-- 输入区 -->
      <InputArea
        :loading="loading"
        :context="context"
        :model-name="activeSession?.modelId"
        :model-options="modelOptions"
        @send="onSend"
        @stop="onStop"
        @retry="onRetry"
        @update:context="onContextChange"
        @update:model-name="onModelChange"
      />

      <!-- 状态栏 -->
      <StatusBar
        :connected="true"
        mode="Agent"
        :model-name="currentModelName"
        :tokens="activeSession?.tokenCount ?? 0"
        :cost="0"
        :mcp-ready="0"
        :mcp-total="0"
      />
    </div>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  margin-left: -200px;
  opacity: 0;
}
</style>