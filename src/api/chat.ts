/**
 * AI 助手 API：会话模块
 *
 * 对齐后端契约：
 *   GET    /chat/sessions                  会话列表
 *   GET    /chat/sessions/{id}             会话详情
 *   POST   /chat/sessions                  创建/更新会话
 *   DELETE /chat/sessions/{id}             删除会话
 *   PATCH  /chat/sessions/{id}/pinned      置顶切换
 *   GET    /chat/sessions/{sessionId}/messages   消息列表
 *   POST   /chat/sessions/{sessionId}/messages   发送消息（非流式）
 *   POST   /chat/sessions/{sessionId}/stop       停止生成
 *
 * 注：此处路径不含 /ai 前缀，由 aiRequestClient.baseURL='/ai' 自动拼接。
 */
import type { ChatMessage } from '../types';
import type { HostBusinessContext } from '../providers/config';

import { aiRequestClient } from './client';
import { ChatApi, path } from './endpoints';

/** 后端返回的 ChatSessionVO（不含 messages） */
export interface ChatSessionVO {
  id: string;
  title: string;
  agentId?: string;
  modelId?: string;
  pinned?: boolean;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
  /** 会话消息条数（后端列表统计） */
  messageCount?: number;
}

/** 后端返回的 ChatMessageVO */
export interface ChatMessageVO {
  id: string;
  sessionId?: string;
  role: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
  reasoning?: string;
  /** 后端以原始 JSON 字符串输出，前端按需 parse */
  toolCalls?: string;
  status: 'complete' | 'error' | 'pending' | 'stopped' | 'streaming';
  /** 同上，原始 JSON 字符串 */
  tokens?: string;
  error?: string;
  createdAt: number;
}

/** 发送消息请求体 */
export interface ChatMessageSendDTO {
  role?: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
  agentId?: string;
  /** 会话模型（供应商目录 ID 或模型原始名；后端按此路由上游模型） */
  modelId?: string;
  /** 当前路由上下文（JSON 字符串：path / title / name） */
  currentRoute?: string;
  /** 当前页面内容上下文（DOM 提取后的文本） */
  pageContext?: string;
  /**
   * PP4 结构化页面快照（内容 + 时效元信息），后端优先于 pageContext 消费。
   * 双写期与 pageContext 并存，后端未升级时忽略未知字段。
   */
  pageSnapshot?: PageSnapshotPayload;
  /** P3-T6：会话内浏览轨迹（最近 5 页；旧后端忽略未知字段） */
  sessionTrail?: SessionTrailItem[];
  /** T6：宿主业务上下文（权威感知源；未注入时不携带，旧后端忽略未知字段） */
  hostContext?: HostBusinessContext;
  /** S4/T3：用户选中文本（显式引用；无选中不携带，≤2000 字符） */
  selectedText?: string;
}

/** P3-T6：浏览轨迹条目 */
export interface SessionTrailItem {
  routePath: string;
  title?: string;
  entity?: string;
  capturedAt: number;
}

/** PP4：随消息上行的页面快照（PageSnapshot 的传输形态，剔除本地 insight） */
export interface PageSnapshotPayload {
  epoch: { configId: string; configVersion: number };
  routePath: string;
  /** 采集完成时间（Unix 毫秒） */
  capturedAt: number;
  /** 采集后 DOM 变异数（时效信号） */
  mutationCount: number;
  stale: boolean;
  text: string;
}

/** 创建/更新会话请求体 */
export interface ChatSessionSaveDTO {
  id?: string;
  title: string;
  agentId?: string;
  modelId?: string;
  pinned?: boolean;
}

/** 会话列表查询参数 */
export interface ChatSessionQueryDTO {
  keyword?: string;
  agentId?: string;
  modelId?: string;
  pinned?: boolean;
  pageNum?: number;
  pageSize?: number;
}

/**
 * 将后端 ChatMessageVO 转为前端 ChatMessage。
 * 后端 toolCalls / tokens 是 JSON 字符串，这里反序列化为前端结构。
 */
export function toChatMessage(vo: ChatMessageVO): ChatMessage {
  let toolCalls: ChatMessage['toolCalls'];
  try {
    toolCalls = vo.toolCalls ? JSON.parse(vo.toolCalls) : undefined;
  } catch {
    toolCalls = undefined;
  }
  let tokens: ChatMessage['tokens'];
  try {
    tokens = vo.tokens ? JSON.parse(vo.tokens) : undefined;
  } catch {
    tokens = undefined;
  }
  return {
    id: vo.id,
    role: vo.role,
    content: vo.content,
    reasoning: vo.reasoning,
    toolCalls,
    status: vo.status,
    tokens,
    error: vo.error,
    createdAt: vo.createdAt,
  };
}

/** 会话列表 */
export function listSessions(params?: ChatSessionQueryDTO) {
  return aiRequestClient.get<ChatSessionVO[]>(ChatApi.SESSIONS, { params });
}

/** 会话详情 */
export function getSession(id: string) {
  return aiRequestClient.get<ChatSessionVO>(path(ChatApi.SESSION_DETAIL, { id }));
}

/** 创建/更新会话。返回会话 ID */
export function saveSession(dto: ChatSessionSaveDTO) {
  return aiRequestClient.post<string>(ChatApi.SESSION_SAVE, dto);
}

/** 删除会话 */
export function deleteSession(id: string) {
  return aiRequestClient.delete(path(ChatApi.SESSION_DELETE, { id }));
}

/** 置顶切换 */
export function toggleSessionPinned(id: string, pinned: boolean) {
  return aiRequestClient.request<void>(
    path(ChatApi.SESSION_PINNED, { id }),
    { method: 'PATCH', params: { pinned } },
  );
}

/** 会话消息列表 */
export function listMessages(sessionId: string) {
  return aiRequestClient.get<ChatMessageVO[]>(
    path(ChatApi.MESSAGES, { sessionId }),
  );
}

/**
 * 发送消息（非流式）。
 * 后端最小闭环：保存用户消息 + 返回占位 assistant 回复。
 * TODO: 接入 SSE 流式后替换为 streamMessage。
 */
export function sendMessage(sessionId: string, dto: ChatMessageSendDTO) {
  return aiRequestClient.post<ChatMessageVO>(
    path(ChatApi.MESSAGES, { sessionId }),
    { ...dto, role: dto.role ?? 'user' },
  );
}

/**
 * 发送消息（SSE 流式）。
 *
 * 后端：POST /chat/sessions/{sessionId}/stream，响应 text/event-stream。
 * 每个事件 data 为 StreamChunk JSON，与前端 types.ts 的 StreamChunk 类型对齐。
 *
 * 实现说明：
 * - client.ts 已经按 text/event-stream 协议解析（按 `\n\n` 切分 + 提取 `data:` 字段），
 *   所以本方法拿到的 onMessage 回调参数是 data 字段纯文本（不含 `data:` 前缀）。
 * - 因此这里直接 `JSON.parse(content)` 即可得到 StreamChunk。
 *
 * @param sessionId 会话 ID（后端雪花 ID 字符串）
 * @param dto       消息体（role/content/agentId）
 * @param onChunk   每个 StreamChunk 的回调
 * @param signal    中断信号（用户点击「停止」时调用 controller.abort()）
 */
export function streamMessage(
  sessionId: string,
  dto: ChatMessageSendDTO,
  onChunk: (chunk: import('../types').StreamChunk) => void,
  signal?: AbortSignal,
): Promise<void> {
  const streamUrl = path(ChatApi.STREAM, { sessionId });
  return aiRequestClient.postSSE(
    streamUrl,
    { ...dto, role: dto.role ?? 'user' },
    {
      signal,
      // SSE 模块手动构造 fetch headers，不继承 axios instance defaults，
      // 需显式声明 Content-Type，否则对象 body 不会被 JSON.stringify，
      // 后端因无法解析 application/x-www-form-urlencoded 报 415。
      headers: { 'Content-Type': 'application/json' },
      onMessage: (content: string) => {
        // client.ts 已经剥离了 `data:` 前缀，content 即 data 字段纯文本
        const trimmed = content.trim();
        if (!trimmed) return;
        // `[DONE]` 等心跳哨兵：忽略
        if (trimmed === '[DONE]') return;
        try {
          onChunk(JSON.parse(trimmed));
        } catch {
          // 忽略半包 / 解析失败（debug 用，生产可降级为 console.warn）
          if (typeof console !== 'undefined') {
            console.warn('[streamMessage] failed to parse SSE chunk:', trimmed);
          }
        }
      },
    },
  );
}

/** T24：附件上传（粘贴/选择的真实通道） */
export function uploadFile(
  file: File,
  signal?: AbortSignal,
): Promise<{ name: string; url: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  return aiRequestClient.post('/chat/upload', fd, {
    signal,
  }) as Promise<{ name: string; url: string; size: number }>;
}

/** T27：恢复最近一次挂起运行（返回 assistant 消息） */
export function resumeRun(sessionId: string) {
  return aiRequestClient.post<ChatMessageVO>(
    `/chat/sessions/${sessionId}/resume`,
  );
}

/** 停止生成 */
export function stopGenerate(sessionId: string) {
  return aiRequestClient.post(path(ChatApi.STOP, { sessionId }));
}

/** 页面上下文一句话摘要（同步调用 LLM） */
/**
 * 页面上下文一句话摘要（PP3：可携带 contentHash 启用后端 Redis 去重，
 * 同一内容重复调用 0 次 LLM；不携带时行为与旧版一致）
 * signal：调用方超时中止（T1-6）
 */
export function summarizeContext(
  currentRoute: string,
  pageContext: string,
  contentHash?: string,
  signal?: AbortSignal,
) {
  return aiRequestClient.post<string>(
    ChatApi.SUMMARIZE_CONTEXT,
    {
      currentRoute,
      pageContext,
      ...(contentHash ? { contentHash } : {}),
    },
    { signal, __silent: true },
  );
}

/**
 * T1-2：感知端点请求体（页面画像 / 意图推断共用）。
 * epoch 由调用方如实构造：有管线快照用快照 epoch；无快照走 capturePageContext
 * 回退文本时显式声明 configId='fallback'（对齐 onSend P4-T3 语义），不伪造默认配置。
 */
export interface PerceptionSnapshotRequestDTO {
  epoch?: { configId: string; configVersion: number };
  routePath: string;
  capturedAt: number;
  mutationCount: number;
  stale: boolean;
  text: string;
}

/** 后端页面画像 VO（解读关闭/降级时字段为空；结构与后端 PageProfile record 对齐） */
export interface PageProfileVO {
  pageType?: string;
  businessContent?: string;
  entities?: Array<{ name: string; type?: string; value: string }>;
  dataStatus?: string;
  operations?: string[];
  insight?: string;
  topics?: string[];
}

/** 后端意图推断条目 */
export interface PageIntentVO {
  text: string;
}

/** 页面画像洞察（探测性调用：__silent 不弹全局错误 toast，失败由调用方回退 UI） */
export function fetchPageProfile(dto: PerceptionSnapshotRequestDTO) {
  return aiRequestClient.post<PageProfileVO | null>(
    ChatApi.PERCEPTION_INSIGHT,
    dto,
    { __silent: true },
  );
}

/** 意图推断「猜你想问」（后端 IntentRequest：快照嵌套于 snapshot 字段） */
export function fetchPageIntents(dto: {
  snapshot: PerceptionSnapshotRequestDTO;
  sessionTrail?: string;
  recentUserMessages?: string[];
}) {
  return aiRequestClient.post<PageIntentVO[]>(
    ChatApi.PERCEPTION_INTENTS,
    dto,
    { __silent: true },
  );
}

/**
 * Diff 审批请求体
 */
export interface DiffApprovalDTO {
  /** 审批动作 */
  action: 'accept' | 'accept_line' | 'reject' | 'reject_line';
  /** 按行接受/拒绝时的行 index */
  lineIndex?: number;
}

/**
 * Diff 审批：接受/拒绝/按行接受。
 * 后端将根据审批结果应用或丢弃文件修改。
 */
export function approveDiff(
  sessionId: string,
  diffId: string,
  dto: DiffApprovalDTO,
) {
  return aiRequestClient.post<void>(
    path(ChatApi.DIFF_APPROVE, { sessionId, diffId }),
    dto,
  );
}

/**
 * 工具调用审批：授权/拒绝。
 * 后端收到授权后继续执行工具，拒绝则中断。
 */
export function respondToolApproval(
  sessionId: string,
  approvalId: string,
  approved: boolean,
) {
  return aiRequestClient.post<void>(
    path(ChatApi.TOOL_APPROVAL, { sessionId, approvalId }),
    { approved },
  );
}
