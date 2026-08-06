/**
 * AI 助手 API 路径集中定义
 *
 * 后端 Controller 路径不含 /ai 前缀（由网关/vite proxy 剥离）。
 * 前端调用时统一以 /ai 开头，aiRequestClient.baseURL = '/ai'，
 * 因此下方 Api 路径不含 /ai 前缀。
 *
 * 对齐契约：memory/tasks-2608-0316/BE-T3-API契约-完整版.md
 */

export enum ProviderApi {
  /** 供应商列表 */
  LIST = '/providers',
  /** 供应商详情 */
  DETAIL = '/providers/{id}',
  /** 创建/更新供应商 */
  SAVE = '/providers',
  /** 删除供应商 */
  DELETE = '/providers/{id}',
  /** 切换启用状态 */
  TOGGLE_ENABLED = '/providers/{id}/enabled',
  /** 测试连通性 */
  TEST = '/providers/{id}/test',
  /** 模型列表 */
  MODELS = '/providers/{id}/models',
}

export enum SkillApi {
  LIST = '/skills',
  ENABLED = '/skills/enabled',
  DETAIL = '/skills/{id}',
  SAVE = '/skills',
  DELETE = '/skills/{id}',
  TOGGLE_ENABLED = '/skills/{id}/enabled',
  /** 分类字典：列表 */
  CATEGORIES = '/skills/categories',
  /** 分类字典：删除 */
  CATEGORY_DELETE = '/skills/categories/{id}',
}

export enum AgentApi {
  LIST = '/agents',
  ENABLED = '/agents/enabled',
  DETAIL = '/agents/{id}',
  SAVE = '/agents',
  DELETE = '/agents/{id}',
  TOGGLE_ENABLED = '/agents/{id}/enabled',
}

export enum McpApi {
  LIST = '/mcp/servers',
  DETAIL = '/mcp/servers/{id}',
  SAVE = '/mcp/servers',
  DELETE = '/mcp/servers/{id}',
  TOGGLE_ENABLED = '/mcp/servers/{id}/enabled',
  TEST = '/mcp/servers/{id}/test',
  TOOLS = '/mcp/servers/{id}/tools',
  REFRESH_TOOLS = '/mcp/servers/{id}/refresh-tools',
  RESOURCES = '/mcp/servers/{id}/resources',
  PROMPTS = '/mcp/servers/{id}/prompts',
}

export enum KnowledgeApi {
  BASES = '/knowledge/bases',
  BASE_DETAIL = '/knowledge/bases/{id}',
  BASE_SAVE = '/knowledge/bases',
  BASE_DELETE = '/knowledge/bases/{id}',
  RETRIEVE = '/knowledge/bases/{kbId}/retrieve',
  DOCUMENTS = '/knowledge/bases/{kbId}/documents',
  DOC_DELETE = '/knowledge/documents/{id}',
  DOC_REINDEX = '/knowledge/documents/{id}/reindex',
  /** 文档分段列表 */
  DOC_SEGMENTS = '/knowledge/documents/{id}/segments',
}

export enum PerceptionApi {
  LIST = '/perception/configs',
  SAVE = '/perception/configs',
  DELETE = '/perception/configs/{id}',
}

export enum ChatApi {
  SESSIONS = '/chat/sessions',
  SESSION_DETAIL = '/chat/sessions/{id}',
  SESSION_SAVE = '/chat/sessions',
  SESSION_DELETE = '/chat/sessions/{id}',
  SESSION_PINNED = '/chat/sessions/{id}/pinned',
  MESSAGES = '/chat/sessions/{sessionId}/messages',
  STOP = '/chat/sessions/{sessionId}/stop',
  /** SSE 流式发送消息（POST text/event-stream） */
  STREAM = '/chat/sessions/{sessionId}/stream',
  /** 页面上下文一句话摘要（同步 POST） */
  SUMMARIZE_CONTEXT = '/chat/summarize-context',
  /** 斜杠命令（已启用 Skill） */
  SLASH_COMMANDS = '/chat/slash-commands',
  /** Diff 审批：接受/拒绝/按行接受 */
  DIFF_APPROVE = '/chat/sessions/{sessionId}/diffs/{diffId}/approve',
  /** 工具调用审批：授权/拒绝 */
  TOOL_APPROVAL = '/chat/sessions/{sessionId}/approvals/{approvalId}',
}

export enum Nl2sqlApi {
  /** 生成 SQL（同步） */
  GENERATE = '/nl2sql/generate',
  /** Schema Linking 查询（调试） */
  LINK = '/nl2sql/link',
  /** 生成 + 执行 + 解读 */
  EXECUTE = '/nl2sql/execute',
  /** Schema 同步 */
  SCHEMA_SYNC = '/nl2sql/schema/sync',
  /** Schema 表列表 */
  SCHEMA_TABLES = '/nl2sql/schema/tables',
  /** T3.7 审计日志列表 */
  AUDITS = '/nl2sql/audits',
  /** T3.7/T3.1 审计反馈 */
  AUDIT_FEEDBACK = '/nl2sql/audits/{id}/feedback',
  /** T3.4 数据源列表 */
  DATASOURCES = '/nl2sql/datasources',
  /** T3.4 数据源详情 */
  DATASOURCE_DETAIL = '/nl2sql/datasources/{id}',
  /** T3.4 数据源连通性测试 */
  DATASOURCE_TEST = '/nl2sql/datasources/{id}/test',
  /** T3.4 已启用数据源 */
  DATASOURCES_ENABLED = '/nl2sql/datasources/enabled',
}

export enum HealthApi {
  PING = '/health/ping',
}

/** 路径参数替换工具（强制 stringify，兼容 Vue reactive Proxy） */
export function path(
  tpl: string,
  params: Record<string, string | number | object>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v !== undefined && v !== null ? String(v) : `{${k}}`;
  });
}
