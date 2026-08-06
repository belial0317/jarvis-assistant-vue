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
  /** 当前路由上下文（JSON 字符串：path / title / name） */
  currentRoute?: string;
  /** 当前页面内容上下文（DOM 提取后的文本） */
  pageContext?: string;
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
 * 实现说明：postSSE 把 fetch ReadableStream 的原始 chunk 推给 onMessage，
 * 不做 SSE 协议解析（event:/data: 行分割）。本方法在客户端维护 buffer，
 * 按 \n\n 分割事件，再提取 data: 行 parse 为 StreamChunk。
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
  let buffer = '';
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
        buffer += content;
        // 按空行分割 SSE 事件
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          // 解析事件内的 data: 行（SseEmitter 默认输出 data:JSON）
          for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              try {
                onChunk(JSON.parse(trimmed.slice(5).trim()));
              } catch {
                // 忽略半包/解析失败
              }
            }
          }
        }
      },
    },
  );
}

/** 停止生成 */
export function stopGenerate(sessionId: string) {
  return aiRequestClient.post(path(ChatApi.STOP, { sessionId }));
}

/** 页面上下文一句话摘要（同步调用 LLM） */
export function summarizeContext(currentRoute: string, pageContext: string) {
  return aiRequestClient.post<string>(ChatApi.SUMMARIZE_CONTEXT, {
    currentRoute,
    pageContext,
  });
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
