<script lang="ts" setup>
import { createIconifyIcon } from '../../providers/icons';

import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import type {
  ChatMessage,
  ChatSession,
  ContextItem,
  DiffAction,
  StreamChunk,
} from '../../types';

import {
  approveDiff,
  fetchPageIntents,
  fetchPageProfile,
  listMessages,
  listSessions,
  respondToolApproval,
  saveSession,
  streamMessage,
  stopGenerate,
  summarizeContext,
  toChatMessage,
  toggleSessionPinned,
  type ChatSessionVO,
  type PageProfileVO,
} from '../../api/chat';
import { aiRequestClient } from '../../api/client';
import { fetchModelCatalog, hasResumableRun, resumeRun } from '../../api/chat';
import { listAgents, type AgentVO } from '../../api/agent';
import { updateToolApprovalPolicy } from '../../api/mcp';
import { listProviders } from '../../api/provider';

import MessageItem from '../../components/message-item.vue';
import {
  buildPageInsight,
  capturePageContext,
  loadPerceptionConfigs,
  type PageInsight,
} from '../../utils/page-context';
import { fnv1a64, summaryHash } from '../../perception/hash';
import { useBackendHealth } from '../../composables/use-backend-health';
import { usePerception } from '../../composables/use-perception';
import { pagePerception, type PerceptionStage } from '../../perception/manager';
import { trackMetric } from '../../perception/metrics';
import StatusBar from '../../components/status-bar.vue';
import InputArea from './input-area.vue';
import { useAiAssistantConfig } from '../../providers';
import { AI_ASSISTANT_HOST_CONTEXT_KEY } from '../../providers/host-context';

defineOptions({ name: 'AiChatWorkbench' });

defineEmits<{
  /** 通知父级跳转到设置页 */
  'go-settings': [];
}>();

const config = useAiAssistantConfig();
// T6:宿主业务上下文(权威感知源;未注入为 null,不伪造默认值)
const hostContextStore = inject(AI_ASSISTANT_HOST_CONTEXT_KEY, null);

// ===== S5/T4:感知总开关(用户偏好持久化;宿主 config.perception.defaultEnabled 决定缺省) =====
const PERCEPTION_ENABLED_KEY = 'ai_assistant_perception_enabled';
const perceptionOn = ref(true);
function applyPerceptionEnabled(enabled: boolean, persist: boolean): void {
  perceptionOn.value = enabled;
  pagePerception.setPerceptionEnabled(enabled);
  if (persist) localStorage.setItem(PERCEPTION_ENABLED_KEY, String(enabled));
}
function togglePerception(): void {
  applyPerceptionEnabled(!perceptionOn.value, true);
}
const perceptionEnabled = computed(() => perceptionOn.value);

const PlusIcon = createIconifyIcon('lucide:plus');
const HistoryIcon = createIconifyIcon('lucide:history');
const ListIcon = createIconifyIcon('lucide:list-checks');
const NetworkIcon = createIconifyIcon('lucide:network');
/** 方案 C-1：监督者常驻化——多专家协作开关（绑定/解绑智能路由中枢） */
const SUPERVISOR_AGENT_NAME = '智能路由中枢';
const supervisorAgentId = computed(() => agents.value.find((a) => a.name === SUPERVISOR_AGENT_NAME)?.id);
const multiExpertActive = computed(() => !!activeSession.value?.agentId && activeSession.value.agentId === supervisorAgentId.value);
function toggleMultiExpert() {
  if (!activeSession.value) return;
  if (multiExpertActive.value) {
    clearAgent(); // 降级回自动路由
  } else if (supervisorAgentId.value) {
    onAgentChange(supervisorAgentId.value); // 升级为监督者编排
  }
}
const PinIcon = createIconifyIcon('lucide:pin');
const PinOffIcon = createIconifyIcon('lucide:pin-off');
const PencilIcon = createIconifyIcon('lucide:pencil');
const SearchIcon = createIconifyIcon('lucide:search');
const TrashIcon = createIconifyIcon('lucide:trash-2');
const ChevronIcon = createIconifyIcon('lucide:chevron-left');
const BotIcon = createIconifyIcon('lucide:bot');
const RadarIcon = createIconifyIcon('lucide:radar');

// ===== 会话管理（真实 API） =====
const sessions = ref<ChatSession[]>([]);
const activeId = ref('');
const activeSession = computed(
  () => sessions.value.find((s) => s.id === activeId.value),
);

const showHistory = ref(false);
const loadingSessions = ref(false);

// ===== T15：会话列表（搜索 / 置顶 / 重命名 / 分组 / 时间戳） =====
const sessionKeyword = ref('');
const routedAgentName = ref('');
const routedMethod = ref('');
const renamingSession = ref<ChatSession | null>(null);
const renameText = ref('');

const filteredSessions = computed(() => {
  const kw = sessionKeyword.value.trim().toLowerCase();
  const list = kw
    ? sessions.value.filter((s) => s.title.toLowerCase().includes(kw))
    : sessions.value.slice();
  // 置顶优先，其余按更新时间倒序
  return list.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
});

const sessionGroups = computed(() => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const groups: Array<{ label: string; items: ChatSession[] }> = [];
  const pinned = filteredSessions.value.filter((s) => s.pinned);
  const today = filteredSessions.value.filter(
    (s) => !s.pinned && s.updatedAt >= todayStart.getTime(),
  );
  const earlier = filteredSessions.value.filter(
    (s) => !s.pinned && s.updatedAt < todayStart.getTime(),
  );
  if (pinned.length) groups.push({ label: '置顶', items: pinned });
  if (today.length) groups.push({ label: '今天', items: today });
  if (earlier.length) groups.push({ label: '更早', items: earlier });
  return groups;
});

function fmtSessionTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—'; // 防御：非法时间戳不输出 NaN
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === new Date().toDateString()) return hm;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function togglePin(s: ChatSession) {
  const next = !s.pinned;
  s.pinned = next; // 乐观更新
  try {
    await toggleSessionPinned(s.id, next);
  } catch {
    s.pinned = !next; // 失败回滚
  }
}

function openRename(s: ChatSession) {
  renamingSession.value = s;
  renameText.value = s.title;
}

async function confirmRename() {
  const target = renamingSession.value;
  const title = renameText.value.trim();
  if (!target || !title) {
    renamingSession.value = null;
    return;
  }
  const old = target.title;
  target.title = title; // 乐观更新
  renamingSession.value = null;
  try {
    await saveSession({
      id: target.id,
      title,
      agentId: target.agentId,
      modelId: target.modelId,
      pinned: target.pinned,
    });
  } catch {
    target.title = old; // 失败回滚
  }
}

// ===== 页面感知摘要（空会话时展示，LLM 一句话总结）=====
// PP4：感知管线接管 DOM 采集；洞察来自快照（captured 事件驱动，实时于旧轮询）
const perception = usePerception();
const hasMessages = computed(
  () => (activeSession.value?.messages.length ?? 0) > 0,
);
const pageInsight = computed<PageInsight | null>(() =>
  hasMessages.value ? null : perception.insight.value,
);
const insightLoading = ref(false);
const insightSummary = ref('');

/**
 * 感知阶段：内核状态映射 + 摘要流程覆盖。
 * - DOM 采集部分（idle/extracting/done/failed）由 kernel 状态机接管；
 * - 摘要生成中（perceiving）由 refreshPageInsight 置位，不被内核覆盖。
 */
type PerceptionStageUi = 'done' | 'extracting' | 'failed' | 'idle' | 'perceiving';
const perceptionStage = ref<PerceptionStageUi>('idle');

function mapKernelStage(stage: PerceptionStage): PerceptionStageUi {
  switch (stage) {
    case 'observing':
      return 'extracting';
    case 'ready':
    case 'stale':
      return 'done';
    case 'degraded':
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

watch(perception.stage, (stage) => {
  if (insightLoading.value) return; // 摘要进行中保持 perceiving
  perceptionStage.value = mapKernelStage(stage);
});

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

// P3-T5：页面画像洞察（业务内容/数据现状 + 话题 chips；解读关闭/降级 → null 回退现状 UI）
const pageProfileInsight = ref<{ business: string; dataStatus: string; topics: string[] } | null>(null);
let lastProfileHash = '';

// P3-T6：会话内浏览轨迹（最近 5 页；发送后记录当前页，支撑跨页指代）
const sessionTrail = ref<Array<{ routePath: string; title?: string; entity?: string; capturedAt: number }>>([]);

/**
 * T1-2/T1-3：构造感知端点（画像/意图）快照请求体。
 * epoch 如实声明——有管线快照用快照 epoch；无快照走 capturePageContext 回退
 * 文本时显式 configId='fallback'（对齐 onSend P4-T3 语义）；无任何文本返回 null
 * （调用方跳过请求，缺失是业务事实，不伪造默认配置）。
 */
function buildPerceptionPayload() {
  const snapshot = perception.snapshot.value;
  const text = snapshot?.text ?? capturePageContext(config.route?.getRoute().path);
  if (!text) return null;
  return {
    epoch: snapshot?.epoch ?? { configId: 'fallback', configVersion: 1 },
    routePath: config.route?.getRoute().path ?? '/',
    capturedAt: snapshot?.capturedAt ?? Date.now(),
    mutationCount: snapshot?.mutationCount ?? 0,
    stale: snapshot?.stale ?? false,
    text,
  };
}

async function refreshPageProfile() {
  const payload = buildPerceptionPayload();
  if (!payload) {
    pageProfileInsight.value = null;
    return;
  }
  try {
    const p: PageProfileVO | null = await fetchPageProfile(payload);
    // 空画像（解读关闭/降级）→ 显式回退，不渲染空壳
    pageProfileInsight.value =
      p && (p.businessContent || p.dataStatus)
        ? {
            business: p.businessContent ?? '',
            dataStatus: p.dataStatus ?? '',
            topics: (p.topics ?? []).slice(0, 3),
          }
        : null;
  } catch {
    pageProfileInsight.value = null;
  }
}

// P4-T2：意图推断（"猜你想问"；画像+轨迹驱动；开关关闭/失败 → null 回退话题 chips）
const intentSuggestions = ref<string[] | null>(null);

async function refreshIntents() {
  const payload = buildPerceptionPayload();
  if (!payload) {
    intentSuggestions.value = null;
    return;
  }
  try {
    const list = await fetchPageIntents({
      snapshot: payload,
      sessionTrail: sessionTrail.value.map(
        (t) => `${t.routePath}${t.entity ? `（主体：${t.entity}）` : ''}`,
      ).join('；') || '无',
      recentUserMessages: activeSession.value?.messages
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.content.slice(0, 80)) ?? [],
    });
    const texts = (list ?? []).map((i) => i.text).filter(Boolean);
    intentSuggestions.value = texts.length ? texts : null;
  } catch {
    intentSuggestions.value = null;
  }
}

// 打开助手且无消息时拉取（T1-5：全文 FNV-1a 哈希做去重键，
// 修复旧 text.slice(0,100) 键下长列表翻页画像不刷新的问题）
watch(
  () => [hasMessages.value, perception.snapshot.value?.text],
  ([empty]) => {
    if (!empty) {
      pageProfileInsight.value = null;
      return;
    }
    const text = perception.snapshot.value?.text ?? '';
    const hash = text ? fnv1a64(text) : '';
    if (hash && hash !== lastProfileHash) {
      lastProfileHash = hash;
      refreshPageProfile();
      refreshIntents();
    }
  },
  { immediate: true },
);

async function refreshPageInsight() {
  // PP4：洞察已由感知管线驱动（pageInsight computed），此处只负责标题摘要
  // 先同步刷新一次快照：路由刚切换时确保拿到当前页面内容而非上一页 last-good
  perception.refresh();

  // 后端未连通：跳过 summarizeContext 调用，避免 4–5 个并发错误 toast
  if (health.value.state !== 'connected') {
    insightSummary.value = '';
    perceptionStage.value = 'failed';
    insightLoading.value = false;
    return;
  }

  // 不管有无消息，都生成标题摘要（用于替换会话标题）
  // 快照文本优先；无快照/为空时回退 capturePageContext，再退路由信息
  const route = config.route?.getRoute();
  const pageContext =
    perception.snapshot.value?.text ||
    (() => {
      try {
        return capturePageContext(route?.path);
      } catch {
        return '';
      }
    })();
  // pageContext 为空时仍尝试请求后端（传路由信息作为 fallback），
  // 避免 capturePageContext 返回空导致 summarizeContext 永不被调用
  const contextForSummary = pageContext || `路由: ${route?.path}\n页面: ${route?.title ?? '未知'}`;
  const routeJson = JSON.stringify({ path: route?.path, title: route?.title });

  const token = ++lastSummaryToken;
  insightLoading.value = true;
  perceptionStage.value = 'perceiving';
  insightSummary.value = '';
  // T1-6：15s 超时经 AbortSignal 真正中止底层请求（旧 Promise.race 仅放弃等待，
  // fetch 仍在后台占用连接）；信号贯通 summarizeContext → doRequest → fetch。
  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), 15000);
  try {
    const summary = await summarizeContext(
      routeJson,
      contextForSummary,
      // PP3：内容哈希 → 后端 Redis 去重（TTL 24h），同页面重复导航 0 次 LLM
      summaryHash(routeJson, contextForSummary),
      timeoutCtrl.signal,
    );
    if (token !== lastSummaryToken) return;
    insightSummary.value = (summary || '').trim();
    perceptionStage.value = insightSummary.value ? 'done' : 'failed';
    trackMetric({ scene: 'summary', routePath: config.route?.getRoute().path, result: insightSummary.value ? 'ok' : 'fallback' });
  } catch (err) {
    console.warn('[refreshPageInsight] summarizeContext failed:', err);
    if (token !== lastSummaryToken) return;
    insightSummary.value = '';
    perceptionStage.value = 'failed';
  } finally {
    clearTimeout(timeoutId);
    if (token === lastSummaryToken) insightLoading.value = false;
  }
}

watch(
  () => config.route?.getRoute().path,
  () => refreshPageInsight(),
);

// ===== 模型选择（真实 Provider API） =====
// 后端 Provider 为平台级共享（不参与多租户过滤），加载已启用供应商的模型
// 默认模型优先级：宿主/门户下发的 syncParams.defaultModel（控制台系统设置）>
// 供应商目录 isDefault 排序。管理端配置的模型需存在于供应商模型目录中。
const modelOptions = ref<Array<{ label: string; value: string; name?: string }>>([]);

const syncedDefaultModel = config.syncParams?.defaultModel?.trim() ?? '';
// 控制台下发的模型列表（系统参数 component.models），配置后为唯一模型源
const consoleModels = (config.models ?? [])
    .map((m) => m.trim())
    .filter(Boolean);

/** 新会话默认模型：系统设置默认模型在选项中时优先，否则回落列表/目录首位 */
function preferredModelId(): string {
  if (syncedDefaultModel) {
    const hit = modelOptions.value.find(
      (m) =>
        m.value === syncedDefaultModel ||
        (m.name ?? '').toLowerCase() === syncedDefaultModel.toLowerCase() ||
        m.label.toLowerCase() === syncedDefaultModel.toLowerCase(),
    );
    if (hit) return hit.value;
  }
  return modelOptions.value[0]?.value ?? '';
}

async function loadModelOptions() {
  // tasks-2609-1400-10 增量：模型选项 = 套餐关联模型 ∪ 本人私有模型（目录端点为权威来源）
  try {
    const catalog = await fetchModelCatalog();
    const list: Array<{ label: string; value: string; name?: string }> = [];
    for (const pv of catalog.providers ?? []) {
      for (const m of pv.models ?? []) {
        list.push({ label: m.displayName || m.name, value: m.id, name: m.name });
      }
    }
    if (list.length > 0) {
      modelOptions.value = list;
      return;
    }
  } catch {
    // 目录不可达（无 sk-key 等）：回退供应商列表路径
  }
  // 控制台配置了模型列表：以它为唯一模型源（值为模型名，后端原始名直传）
  if (consoleModels.length > 0) {
    modelOptions.value = consoleModels.map((m) => ({ label: m, value: m }));
    return;
  }
  try {
    const providers = await listProviders({ enabled: true });
    const list: Array<{ label: string; value: string; name?: string }> = [];
    for (const p of providers) {
      for (const m of p.models ?? []) {
        // 会话对话通道只用 chat 模型；embedding 等其他类型不进下拉（防误选导致对话 404）
        if (m.modelType && m.modelType !== 'chat') continue;
        list.push({ label: m.displayName, value: m.id, name: m.name });
      }
    }
    // 排序：isDefault=true 排第一（默认选中），其他按原顺序
    list.sort((a, b) => {
      const aDef = providers
        .flatMap((p) => p.models ?? [])
        .find((m) => m.id === a.value)?.isDefault
        ? -1
        : 0;
      const bDef = providers
        .flatMap((p) => p.models ?? [])
        .find((m) => m.id === b.value)?.isDefault
        ? -1
        : 0;
      return aDef - bDef;
    });
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
      modelId: preferredModelId(),
    });
    // 构造本地会话对象并加入列表
    const session = reactive<ChatSession>({
      id: newId,
      title: '新对话',
      agentId,
      modelId: preferredModelId(),
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
    // 控制台系统设置为权威：会话加载时模型对齐系统设置（目录中存在时），
    // 存储值仅作回落（目录为空等场景）。会话内手动切换下拉仍即时生效。
    modelId: preferredModelId() || vo.modelId || '',
    messages: [],
    context: [],
    pinned: vo.pinned,
    // 后端 write-numbers-as-strings 会把 Long（时间戳/tokenCount）序列化为字符串，
    // 直接透传会导致 new Date("1789…") = Invalid Date → 会话历史显示 "NaN-NaN"（缺陷根因），
    // 排序比较同样失准——统一归一化为 number
    tokenCount: Number(vo.tokenCount ?? 0) || 0,
    createdAt: Number(vo.createdAt ?? 0) || 0,
    updatedAt: Number(vo.updatedAt ?? 0) || 0,
    messageCount: Number(vo.messageCount ?? 0) || 0,
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
      modelId: preferredModelId(),
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
    // 创建失败：保留在当前会话。失败原因已由 aiRequestClient 的 showError
    // （宿主注入的 onError 回调）向用户展示，此处不静默吞掉错误信息。
  }
}

/** 切换会话 */
async function switchSession(id: string) {
  activeId.value = id;
  showHistory.value = false;
  await loadMessages(id);
  scrollToBottom();
  refreshPageInsight();
  // tasks-2609-1323-00 T3：切入的会话若有未完成运行，自动续接补齐
  void autoResumeIfInterrupted(id);
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
// T6-U3：停止中相位（点击停止 → done/error 收尾前，停止按钮禁用防重复点击）
const stopping = ref(false);

// ===== T10：任务面板 =====
const showTasks = ref(false);
const tasks = ref<import('../../types').TaskSummary[]>([]);
async function fetchTasks() {
  if (!activeId.value) return;
  try {
    const res = await aiRequestClient.get<{ id: string; subject: string; state: string }[]>(
      `/chat/sessions/${activeId.value}/tasks`,
    );
    tasks.value = (res ?? []).map((t) => ({
      id: String(t.id),
      subject: String(t.subject ?? ''),
      state: (t.state as import('../../types').TaskSummary['state']) ?? 'pending',
    }));
  } catch {
    tasks.value = [];
  }
}
function toggleTasks() {
  showTasks.value = !showTasks.value;
  if (showTasks.value) void fetchTasks();
}
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
  // PP4：pageInsight 为 computed（有消息自动隐藏），无需手动清空
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
  // 防御性中止上一轮仍在运行的请求，避免并发 SSE 流互相干扰
  // （vite proxy 对并发 SSE 长连接处理不完善，可能导致请求被丢弃）
  abortController?.abort();
  abortController = new AbortController();

  try {
    const currentRoute = JSON.stringify({
      path: config.route?.getRoute().path,
      name: String(config.route?.getRoute().name ?? ''),
      title: (config.route?.getRoute().title as string) ?? '',
    });
    // PP4：发送前同步重采集（stale 时 DOM 同步重读），快照 + 纯文本双写。
    // 后端优先消费 pageSnapshot（含时效元信息），未升级时忽略并回退 pageContext。
    // S5/T4:感知关闭 → 不采集、不上行任何页面/选中/宿主上下文字段
    const snapshot = perceptionOn.value ? perception.refresh() : null;
    // S4/T3：发送时刻读取选中（独立轻量信号，随消息平级上行）
    const selection = perceptionOn.value ? pagePerception.getSelection() : '';
    const fallbackText = perceptionOn.value
      ? capturePageContext(config.route?.getRoute().path)
      : '';
    const pageContext = snapshot?.text ?? fallbackText;
    // P4-T3：无感知配置的宿主页面构造回退快照——保证画像/实体路由在任何宿主页都可用
    // （captureLatest 返回 null = 主内容区选择器未命中，而非页面无内容）
    const effectiveSnapshot = snapshot ?? (fallbackText
      ? {
          epoch: { configId: 'fallback', configVersion: 1 },
          routePath: config.route?.getRoute().path ?? '/',
          capturedAt: Date.now(),
          mutationCount: 0,
          stale: false,
          text: fallbackText,
        }
      : null);

    // P3-T6：发送即记录当前页到轨迹（同 route 连续不重复；S5 感知关闭时不记录）
    if (perceptionOn.value) {
      const routePath = config.route?.getRoute().path ?? '/';
      const last = sessionTrail.value[sessionTrail.value.length - 1];
      if (!last || last.routePath !== routePath) {
        // P4-T3：主体实体回填（画像 businessContent 中提取"主体=xxx"；无画像留空不伪造）
        let entityValue: string | undefined;
        if (pageProfileInsight.value?.business) {
          const m = pageProfileInsight.value.business.match(/主体[=：:]\s*([^，,；;\s]+)/);
          entityValue = m?.[1];
        }
        sessionTrail.value.push({
          routePath,
          // T1-4：轨迹记录页面标题（旧值误填 route.name —— 路由注册名非展示标题）
          title: (config.route?.getRoute().title as string) || undefined,
          entity: entityValue,
          capturedAt: Date.now(),
        });
        if (sessionTrail.value.length > 5) {
          sessionTrail.value = sessionTrail.value.slice(-5);
        }
      }
    }

    const hostContext = perceptionOn.value
      ? hostContextStore?.context.value ?? null
      : null;
    // 附件提取（发送前）：context 中已上传的附件（ref 含 /attachments/{id}/download），
    // 图片走多模态；注意保持字符串——雪花 ID 超 JS Number 精度（2^53），转 Number 会丢位
    const attachmentIds = (context.value ?? [])
      .map((c) => c.ref?.match(/attachments\/(\d+)\/download/)?.[1])
      .filter((v): v is string => !!v);
    // 发送请求发出即清空输入区附件 chip（不等 LLM 流结束）
    context.value = [];
    if (activeSession.value) {
      activeSession.value.context = [];
    }
    await streamMessage(
      session.id,
      {
        agentId: session.agentId,
        // 会话模型跟随下拉选择（后端按 modelId 解析网关模型名）
        modelId: session.modelId,
        content: text,
        currentRoute,
        pageContext,
        ...(attachmentIds.length ? { attachments: attachmentIds } : {}),
        // S4/T3：用户选中文本（显式引用「指哪问哪」；无选中不携带）
        ...(selection ? { selectedText: selection } : {}),
        // T6：宿主业务上下文（权威感知源，后端注入【宿主业务上下文】块）
        ...(hostContext ? { hostContext } : {}),
        // P3-T6：会话内浏览轨迹（旧后端忽略未知字段；S5 感知关闭时不上送历史轨迹）
        ...(perceptionOn.value && sessionTrail.value.length
          ? { sessionTrail: sessionTrail.value.slice(-5) }
          : {}),
        ...(effectiveSnapshot
          ? {
              pageSnapshot: {
                epoch: effectiveSnapshot.epoch,
                routePath: effectiveSnapshot.routePath,
                capturedAt: effectiveSnapshot.capturedAt,
                mutationCount: effectiveSnapshot.mutationCount,
                stale: effectiveSnapshot.stale,
                text: effectiveSnapshot.text,
              },
            }
          : {}),
      },
      (chunk: StreamChunk) => {
        switch (chunk.type) {
          case 'reasoning': {
            if (!reactiveAssistant.reasoningStartTs) {
              reactiveAssistant.reasoningStartTs = Date.now();
            }
            reactiveAssistant.reasoning = (reactiveAssistant.reasoning ?? '') + (chunk.text ?? '');
            break;
          }
          case 'delta': {
            if (reactiveAssistant.status === 'pending') {
              reactiveAssistant.status = 'streaming';
            }
            // T14：思考结束（正文开始）→ 固化思考耗时
            if (reactiveAssistant.reasoningStartTs && !reactiveAssistant.reasoningMs) {
              reactiveAssistant.reasoningMs = Date.now() - reactiveAssistant.reasoningStartTs;
            }
            reactiveAssistant.content += chunk.text ?? '';
            // T14：有实际内容则清除超限 Alert（总结成功即无需人工继续）
            reactiveAssistant.exceedMaxIters = undefined;
            scrollToBottom();
            break;
          }
          case 'replace': {
            // 后端正则脱敏后替换全部内容（安全兜底）
            reactiveAssistant.content = chunk.text ?? '';
            reactiveAssistant.exceedMaxIters = undefined;
            scrollToBottom();
            break;
          }
          case 'exceed_max_iters': {
            // T14-U18：达到最大迭代（琥珀 Alert + 「继续」按钮）
            reactiveAssistant.exceedMaxIters =
              typeof chunk.iters === 'number' ? chunk.iters : undefined;
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
                // T13：文档工具结果 JSON 含 artifactId → 解析为产物卡片
                try {
                  const parsed = JSON.parse(tc.result ?? '{}');
                  if (parsed?.artifactId) {
                    tc.artifact = parsed;
                    if (!reactiveAssistant.artifacts) {
                      reactiveAssistant.artifacts = [];
                    }
                    if (!reactiveAssistant.artifacts.some((a) => a.artifactId === parsed.artifactId)) {
                      reactiveAssistant.artifacts.push(parsed);
                    }
                  }
                } catch {
                  // 非 JSON 结果忽略
                }
              }
            }
            break;
          }
          case 'attachment_status': {
            if (chunk.attachmentStatus) {
              reactiveAssistant.attachmentStatus = chunk.attachmentStatus;
              scrollToBottom();
            }
            break;
          }
          case 'artifact_created': {
            if (chunk.artifact) {
              if (!reactiveAssistant.artifacts) {
                reactiveAssistant.artifacts = [];
              }
              if (!reactiveAssistant.artifacts.some((a) => a.artifactId === chunk.artifact!.artifactId)) {
                reactiveAssistant.artifacts.push(chunk.artifact);
              }
              scrollToBottom();
            }
            break;
          }
          case 'agent_routed': {
            // 方案 B：默认模式意图路由结果（RULE=规则层 / LLM=分类层）
            if (chunk.agentRouted) {
              routedAgentName.value = chunk.agentRouted.agentName || '';
              routedMethod.value = chunk.agentRouted.method || '';
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
          case 'references': {
            // T4：RAG 检索引用（后端保证先于 delta/done 推送；空数组不推送）
            if (chunk.references?.length) {
              reactiveAssistant.references = chunk.references;
            }
            break;
          }
          case 'reflection': {
            // P1-T5/P2-T5：反思过程两态兼容——
            // 旧契约 rounds 数组（完成后一次推）；新契约 round/gapQueries 单轮实时推（追加合并）
            if (chunk.rounds?.length) {
              reactiveAssistant.reflectionRounds = chunk.rounds;
            } else if (typeof chunk.round === 'number') {
              const list = reactiveAssistant.reflectionRounds ?? [];
              list.push({ round: chunk.round, gapQueries: chunk.gapQueries ?? [] });
              reactiveAssistant.reflectionRounds = [...list];
            }
            scrollToBottom();
            break;
          }
          case 'done': {
            reactiveAssistant.status = 'complete';
            // 终态兜底：后端 AgentRuntime 已发 phase=completed；旧后端/异常时同步徽章，避免"规划中"旋转残留
            if (reactiveAssistant.agentStatus) {
              reactiveAssistant.agentStatus = {
                ...reactiveAssistant.agentStatus,
                phase: 'completed',
              };
            }
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
    stopping.value = false;
    abortController = null;
    void fetchTasks();
    scrollToBottom(true);
  }
}

/** T20：授权并始终允许——审批通过 + 权限规则写 never（后续不再询问） */
async function onToolAlwaysAllow(payload: {
  messageId: string;
  approvalId: string;
  serverName?: string;
  toolName: string;
}) {
  // T20：与 onToolApproval 同口径更新本地审批状态——否则卡片永远停在 pending
  const session = activeSession.value;
  const msg = session?.messages.find((m) => m.id === payload.messageId);
  const approval = msg?.toolApprovals?.find(
    (a) => a.approvalId === payload.approvalId,
  );
  if (approval) approval.status = 'approved';
  await respondToolApproval(activeId.value!, payload.approvalId, true).catch(() => {});
  if (payload.serverName) {
    await updateToolApprovalPolicy(payload.serverName, payload.toolName, 'never').catch(() => {});
  }
}

function onStop() {
  if (stopping.value) return;
  stopping.value = true;
  abortController?.abort();
  // 兜底：异常路径未进 finally 时 3s 后自动复位，避免按钮永久禁用
  setTimeout(() => {
    stopping.value = false;
  }, 3000);
}

/** T14-U18/T27：超限「继续」——优先恢复挂起运行，无挂起则以续写指令发起新一轮 */
async function onContinueRun() {
  if (!activeId.value) return;
  try {
    const vo = await resumeRun(activeId.value);
    const m = toChatMessage(vo);
    const sess = sessions.value.find((s) => s.id === activeId.value);
    if (sess) {
      sess.messages.push(m);
      sess.tokenCount += m.content.length;
    }
    scrollToBottom(true);
  } catch {
    await onSend('请继续完成上面的回答');
  }
}

// ===== tasks-2609-1323-00 T3：断连未完成回复的自动续接 =====
/** 会话级续接互斥（同一会话不并发 resume） */
const autoResuming = ref(false);

/**
 * 惰性探测当前会话是否有可恢复的未完成运行（suspended/interrupted），
 * 有则自动 resume 补齐回复。挂载恢复与切会话时调用；失败显式提示，不自动重发。
 */
async function autoResumeIfInterrupted(sessionId: string) {
  if (!sessionId || autoResuming.value) return;
  const sess = sessions.value.find((s) => s.id === sessionId);
  if (!sess) return;
  try {
    const resumable = await hasResumableRun(sessionId);
    if (!resumable) return;
    autoResuming.value = true;
    const vo = await resumeRun(sessionId);
    const m = toChatMessage(vo);
    sess.messages.push(m);
    sess.tokenCount += m.content.length;
    sess.updatedAt = Date.now();
    scrollToBottom(true);
    showTransientNotice('已自动恢复上次未完成的回复');
  } catch {
    // 显式失败：不自动重发（避免二次失控请求），给出可操作的恢复入口
    showTransientNotice('上次回复未完成，可点击「继续」恢复');
  } finally {
    autoResuming.value = false;
  }
}

/** 轻量提示条（3.5s 自动消失） */
const transientNotice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function showTransientNotice(text: string) {
  transientNotice.value = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    transientNotice.value = '';
  }, 3500);
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

// S6/F1:回答反馈 → 感知度量(旁路;含「AI未理解页面」默认标签)
function onFeedback(payload: {
  messageId: string;
  result: 'thumb_down' | 'thumb_up';
  label?: string;
}): void {
  trackMetric({
    scene: 'feedback',
    routePath: config.route?.getRoute().path,
    result: payload.result,
    label: payload.label ?? (payload.result === 'thumb_down' ? 'AI未理解页面' : undefined),
  });
}

function onContextChange(items: ContextItem[]) {
  context.value = items;
  if (activeSession.value) {
    activeSession.value.context = items;
  }
}

// ===== 初始化 =====
onMounted(async () => {
  // S5/T4:感知开关初始化(用户上次偏好 > 宿主默认值 > 开)
  const saved = localStorage.getItem(PERCEPTION_ENABLED_KEY);
  applyPerceptionEnabled(
    saved === null ? (config.perception?.defaultEnabled ?? true) : saved === 'true',
    false,
  );
  // 感知配置加载与后端健康解耦（P1-3 修复：disconnected 时整段 return 会导致
  // 后端恢复后配置库恒空；此处无条件尝试，失败由 loadPerceptionConfigs 内部静默）
  loadPerceptionConfigs().catch(() => {
    // 后端不可达时保留现有配置库（可能为空），健康恢复后 manifest 机制自动同步
  });
  // 后端未连通：跳过业务 API 调用，由顶部 banner 提示用户
  if (health.value.state === 'disconnected') {
    return;
  }
  // 并行加载模型选项 + Agent 列表 + 会话列表（感知配置已先行加载）
  await Promise.all([
    loadModelOptions(),
    loadAgents(),
    loadSessions(),
  ]);
  if (sessions.value.length === 0) {
    await startNewSession();
  } else {
    scrollToBottom();
  }
  refreshPageInsight();
  // tasks-2609-1323-00 T3：重挂载恢复后，激活会话若有未完成运行则自动续接
  // （覆盖"切页销毁组件再回来"场景；宽限内落库的消息由 loadMessages 直接可见）
  if (activeId.value) {
    void autoResumeIfInterrupted(activeId.value);
  }
});
onUnmounted(() => {
  abortController?.abort();
});
</script>

<template>
  <div class="relative flex h-full min-h-0">
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
        <!-- T15：会话搜索 -->
        <div class="px-2 pb-2">
          <div
            class="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2"
          >
            <component
              :is="SearchIcon"
              class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
            />
            <input
              v-model="sessionKeyword"
              placeholder="搜索会话"
              class="h-full w-full border-0 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
          <!-- T15：骨架屏（替代"加载中..."文本） -->
          <div v-if="loadingSessions" class="space-y-2.5 px-1 py-2">
            <div v-for="i in 4" :key="i" class="animate-pulse">
              <div class="mb-1.5 h-3 w-3/4 rounded bg-accent" />
              <div class="h-2.5 w-1/2 rounded bg-accent" />
            </div>
          </div>
          <template v-else>
            <div v-for="group in sessionGroups" :key="group.label" class="mb-1">
              <div
                class="px-2 py-1 text-[10px] tracking-wide text-muted-foreground"
              >
                {{ group.label }} · {{ group.items.length }}
              </div>
              <div
                v-for="s in group.items"
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
                <div class="flex items-center justify-between gap-1">
                  <div class="truncate font-medium">
                    {{
                      s.id === activeId && insightLoading && !insightSummary
                        ? '正在感知内容...'
                        : s.title
                    }}
                  </div>
                  <!-- T15：mono 时间戳（hover 时让位给操作簇） -->
                  <span
                    class="flex-shrink-0 font-mono text-[10px] text-muted-foreground group-hover:hidden"
                  >
                    {{ fmtSessionTime(s.updatedAt) }}
                  </span>
                </div>
                <div class="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {{ s.messageCount ?? s.messages.length }} 条 ·
                  {{ (s.tokenCount / 1000).toFixed(1) }}k tokens
                </div>
                <!-- T15：hover 操作簇（置顶/重命名/删除） -->
                <div
                  class="absolute right-1 top-1.5 hidden items-center gap-0.5 group-hover:flex"
                >
                  <button
                    type="button"
                    class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    :title="s.pinned ? '取消置顶' : '置顶'"
                    @click.stop="togglePin(s)"
                  >
                    <component
                      :is="s.pinned ? PinIcon : PinOffIcon"
                      class="h-3 w-3"
                    />
                  </button>
                  <button
                    type="button"
                    class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="重命名"
                    @click.stop="openRename(s)"
                  >
                    <component :is="PencilIcon" class="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    class="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    title="删除"
                    @click.stop="deleteSession(s.id)"
                  >
                    <component :is="TrashIcon" class="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
            <div
              v-if="!sessionGroups.length"
              class="px-2 py-3 text-center text-[11px] text-muted-foreground"
            >
              无匹配会话
            </div>
          </template>
        </div>
      </aside>
    </transition>

    <!-- T15：重命名对话框（自绘，风格对齐抽屉） -->
    <div
      v-if="renamingSession"
      class="absolute inset-0 z-20 flex items-center justify-center bg-black/30"
      @click.self="renamingSession = null"
    >
      <div
        class="w-[240px] rounded-lg border border-border bg-background p-3 shadow-lg"
      >
        <div class="mb-2 text-[12px] font-medium">重命名会话</div>
        <input
          v-model="renameText"
          maxlength="100"
          class="mb-3 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/60"
          @keydown.enter="confirmRename"
          @keydown.esc="renamingSession = null"
        />
        <div class="flex justify-end gap-1.5">
          <button
            class="h-7 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground hover:bg-accent"
            @click="renamingSession = null"
          >
            取消
          </button>
          <button
            class="h-7 rounded-md bg-primary px-2.5 text-[12px] text-primary-foreground hover:bg-primary/90"
            @click="confirmRename"
          >
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 主区 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 工具栏 -->
      <div
        class="flex h-[38px] flex-shrink-0 items-center gap-2 border-b border-border bg-background px-3"
      >
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          :class="multiExpertActive ? 'bg-accent text-foreground' : ''"
          :title="multiExpertActive ? '多专家协作：已升级为监督者编排（点击降级回自动路由）' : '多专家协作：本会话升级为监督者编排'"
          aria-label="多专家协作"
          :disabled="!supervisorAgentId"
          @click="toggleMultiExpert"
        >
          <component :is="NetworkIcon" class="h-4 w-4" />
        </button>
        <button
          class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          :class="showTasks ? 'bg-accent text-foreground' : ''"
          aria-label="任务"
          title="任务列表"
          @click="toggleTasks"
        >
          <component :is="ListIcon" class="h-4 w-4" />
        </button>
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
        <!-- S5/T4:感知开关(雷达图标;关=划线灰) -->
        <button
          class="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] transition-colors"
          :class="perceptionOn ? 'text-primary hover:bg-accent' : 'text-muted-foreground hover:bg-accent'"
          :title="perceptionOn ? '页面感知:已开启(点击关闭,AI 将不读取页面内容)' : '页面感知:已关闭(点击开启)'"
          :aria-pressed="perceptionOn"
          @click="togglePerception"
        >
          <component :is="RadarIcon" class="h-3.5 w-3.5" :class="perceptionOn ? '' : 'opacity-40 line-through'" />
          感知
        </button>
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
              {{ currentAgent?.name ?? (routedAgentName ? `已路由 → ${routedAgentName}` : '自动路由') }}
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
                <div class="font-medium">自动路由</div>
                <div class="truncate text-[10px] text-muted-foreground">按问题意图自动分派专家 Agent</div>
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
        <!-- tasks-2609-1323-00 T3：自动续接/失败提示条（3.5s 自动消失） -->
        <div
          v-if="transientNotice"
          class="sticky top-0 z-10 mx-auto w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] text-primary shadow-sm"
        >
          {{ transientNotice }}
        </div>
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
            <!-- P3-T5：页面画像洞察（有画像时显示业务句 + 画像话题；无画像回退默认 hints） -->
            <div
              v-if="pageProfileInsight"
              class="mt-2 max-w-[420px] rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-4 text-muted-foreground"
            >
              <span v-if="pageProfileInsight.business">📄 {{ pageProfileInsight.business }}</span>
              <span v-if="pageProfileInsight.dataStatus" class="block truncate">
                📊 {{ pageProfileInsight.dataStatus }}
              </span>
            </div>
            <!-- P4-T2：猜你想问（意图建议优先；点击预填输入框） -->
            <div
              v-if="intentSuggestions?.length"
              class="mt-2 flex w-full max-w-[460px] flex-col items-center gap-1"
            >
              <span class="text-[10px] text-muted-foreground/70">猜你想问</span>
              <button
                v-for="intent in intentSuggestions"
                :key="intent"
                class="w-full truncate rounded-lg border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] text-primary transition hover:bg-primary/10"
                :title="intent"
                @click="onSend(intent)"
              >
                {{ intent }}
              </button>
            </div>
            <div class="mt-2 flex flex-wrap justify-center gap-2">
              <button
                v-for="hint in (pageProfileInsight?.topics?.length
                  ? pageProfileInsight.topics
                  : (pageInsight?.hints ?? ['你好', '介绍下 Spring AI', '写一个快速排序']))"
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
            v-for="(msg, mi) in messages"
            :key="msg.id"
            :message="msg"
            :prev-created-at="mi > 0 ? messages[mi - 1]?.createdAt : undefined"
            class="group"
            @retry="onRetry"
            @diff-action="onDiffAction"
            @tool-approval="onToolApproval"
            @tool-always-allow="onToolAlwaysAllow"
            @feedback="onFeedback"
            @continue-run="onContinueRun"
          />
        </template>
      </div>

      <!-- T10：任务面板（可收起横条） -->
      <div
        v-if="showTasks"
        class="flex flex-shrink-0 flex-col border-t border-border bg-background-deep px-3 py-2"
      >
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[11px] font-medium">任务列表</span>
          <button
            class="text-[10px] text-muted-foreground hover:text-foreground"
            @click="showTasks = false"
          >
            收起
          </button>
        </div>
        <div v-if="!tasks.length" class="py-1 text-[11px] text-muted-foreground">
          暂无任务——可让 AI 通过 task_create 工具创建
        </div>
        <div
          v-for="t in tasks"
          :key="t.id"
          class="flex items-center gap-2 py-0.5 text-[12px]"
        >
          <span
            class="h-1.5 w-1.5 flex-shrink-0 rounded-full"
            :class="{
              'bg-emerald-500': t.state === 'completed',
              'bg-blue-500 animate-pulse': t.state === 'in_progress',
              'bg-muted-foreground/50': t.state === 'pending',
            }"
          />
          <span
            class="min-w-0 flex-1 truncate"
            :class="t.state === 'completed' ? 'text-muted-foreground line-through' : ''"
          >
            {{ t.subject }}
          </span>
          <span class="flex-shrink-0 font-mono text-[10px] text-muted-foreground">
            {{ t.state }}
          </span>
        </div>
      </div>

      <!-- 输入区 -->
      <InputArea
        :loading="loading"
        :stopping="stopping"
        :context="context"
        :model-id="activeSession?.modelId"
        :model-options="modelOptions"
        :session-id="activeSession?.id"
        @send="onSend"
        @stop="onStop"
        @retry="onRetry"
        @update:context="onContextChange"
        @update:model-id="onModelChange"
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