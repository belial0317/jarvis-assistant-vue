/**
 * AI 助手类型定义
 *
 * 说明：MVP 阶段以前端本地 Mock 驱动，所有结构对齐后续后端契约。
 * 约定：所有 ID 一律 string 类型（与后端雪花 ID 序列化为字符串保持一致）。
 */

/** 左侧导航模块标识 */
export type AIModuleType =
  | 'audit'
  | 'chat'
  | 'schedule'
  | 'skill'
  | 'agent'
  | 'mcp'
  | 'knowledge'
  | 'perception'
  | 'provider'
  | 'settings';

/** 导航项元数据（纯图标 + tooltip 标签） */
export interface AIModuleMeta {
  key: AIModuleType;
  label: string;
  icon: string;
  /** tooltip 副标题，hover 气泡中展示 */
  description?: string;
  /** 是否系统类（与业务模块组分隔显示） */
  system?: boolean;
  /** 是否已完成（未完成模块显示"建设中"占位） */
  ready: boolean;
}

/** 消息角色 */
export type MessageRole = 'assistant' | 'system' | 'tool' | 'user';

/** RAG 检索引用（T4：助手消息的"参考来源"角标，来自 references SSE 事件） */
export interface MessageReference {
  /** 来源文档名 */
  documentName?: string;
  /** 命中分段 ID（雪花 ID 字符串） */
  segmentId?: string;
  /** 相似度分数 0-1 */
  score?: number;
  /** 信息源类型（P1：kb 知识库 / db 数据库 / perception 当前页面；旧后端无此字段） */
  sourceType?: 'db' | 'kb' | 'perception';
}

/** P1-T5：反思轮次（来自 reflection SSE 事件，深度搜索过程展示） */
export interface ReflectionRound {
  round: number;
  gapQueries: string[];
}

/** 消息状态 */
export type MessageStatus =
  | 'complete'
  | 'error'
  | 'pending'
  | 'stopped'
  | 'streaming';

/** 工具调用来源 */
export type ToolSource = 'builtin' | 'mcp';

/** 工具调用状态 */
export type ToolStatus =
  | 'error'
  | 'pending_approval'
  | 'running'
  | 'success';

/** 工具调用（嵌入在助手消息内，可折叠卡片展示） */
export interface ToolCall {
  id: string;
  name: string;
  source: ToolSource;
  /** MCP 来源服务器名 */
  serverName?: string;
  args: Record<string, any>;
  result?: string;
  status: ToolStatus;
  /** 耗时（ms） */
  duration?: number;
}

/** 上下文条目（@ 引用） */
export interface ContextItem {
  id: string;
  label: string;
  ref: string;
  type: 'directory' | 'file' | 'image' | 'knowledge' | 'selection' | 'symbol';
}

/** 单条对话消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** 推理过程（thinking），默认折叠 */
  reasoning?: string;
  toolCalls?: ToolCall[];
  /** 待审批的工具调用请求列表（AI 提议执行高风险工具时生成） */
  toolApprovals?: ToolApprovalRequest[];
  /** ⏳ T8/T14：达到最大迭代轮次（渲染琥珀 Alert + 「继续」） */
  exceedMaxIters?: number;
  /** T14：思考耗时（毫秒，首个 reasoning 块到最后一块的时间差；完成后保留） */
  reasoningMs?: number;
  /** T14：思考起点（运行时字段，随消息创建） */
  reasoningStartTs?: number;
  /** 文件修改 diff 块列表（AI 提议代码修改时生成） */
  diffs?: DiffPatch[];
  /** Agent 运行时状态（仅 Agent 模式下的助手消息有值） */
  agentStatus?: AgentRunStatus;
  /** 方案B：默认模式意图路由结果（仅流式期存在） */
  agentRouted?: { agentId: string; agentName: string; method: 'RULE' | 'LLM' };
  /** NL2SQL 查询结果（仅 NL2SQL 技能触发的助手消息有值，前端渲染表格/图表，sql 字段已脱敏） */
  sqlResult?: import('./api/nl2sql').SqlResultVO;
  /** RAG 检索引用列表（仅命中知识库的助手消息有值，P0 仅流式期存在不持久化） */
  references?: MessageReference[];
  /** 反思轮次（P1-T5：深度搜索过程，完成后折叠展示；仅流式期存在） */
  reflectionRounds?: ReflectionRound[];
  status: MessageStatus;
  tokens?: { input: number; output: number };
  error?: string;
  createdAt: number;
}

/** 会话 */
/** T10：任务摘要（task_list / 任务面板共用） */
export interface TaskSummary {
  id: string;
  subject: string;
  state: 'completed' | 'in_progress' | 'pending';
  blockedBy?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  agentId?: string;
  modelId: string;
  messages: ChatMessage[];
  context: ContextItem[];
  pinned?: boolean;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
  /** 会话消息条数（后端列表统计；未拉取详情时为准） */
  messageCount?: number;
}

/** 供应商类型 */
export type ProviderType =
  | 'anthropic'
  | 'custom'
  | 'ollama'
  | 'openai-compatible';

/** 供应商状态 */
export type ProviderStatus = 'active' | 'error' | 'inactive';

/** 模型类型（区分模型使用场景） */
export type ModelType =
  | 'chat'
  | 'embedding'
  | 'rerank'
  | 'vision'
  | 'tts'
  | 'stt';

/** 供应商模型能力 */
export interface ProviderModel {
  id: string;
  name: string;
  displayName: string;
  /** 模型类型：chat/embedding/rerank/vision/tts/stt */
  modelType: ModelType;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  /** 每 1M tokens 定价（USD） */
  pricing: { input: number; output: number };
  isDefault: boolean;
  /** 连通性测试延迟（ms），未测试为 undefined */
  latency?: number;
}

/** 模型供应商 */
export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  /** 加密存储，前端脱敏展示 */
  apiKeyMasked: string;
  status: ProviderStatus;
  enabled: boolean;
  isBuiltin: boolean;
  models: ProviderModel[];
  createdAt: number;
}

/** 流式输出分片 */
export interface StreamChunk {
  /**
   * 事件类型——与后端 AgentEventType 注册表对齐（tasks-2609-1020-20/T1 契约）。
   * 标注 ⏳ 的为预留类型：后端在 T3/T8/T10/T11 落地，前端可先行注册，
   * 未知类型由分发器默认忽略。
   */
  type:
    | 'agent_status'
    | 'approval_resolved' // ⏳ T3 审批裁决结果
    | 'context_compacted' // ⏳ T4 上下文已压缩
    | 'delta'
    | 'diff'
    | 'done'
    | 'error'
    | 'exceed_max_iters' // ⏳ T8 超过最大迭代
    | 'interrupted' // ⏳ T8 协作式中断确认
    | 'agent_routed' // 方案B：默认模式意图路由
    | 'nl2sql_result'
    | 'reasoning'
    | 'references'
    | 'reflection'
    | 'replace'
    | 'subagent_event' // ⏳ T11 子代理事件
    | 'task_update' // ⏳ T10 任务更新
    | 'tool_approval'
    | 'tool_call'
    | 'tool_call_delta' // ⏳ T8 工具调用参数增量
    | 'tool_result';
  // ---- T1 统一事件包络元数据（所有 chunk 均携带，旧后端缺失时为空） ----
  /** 事件唯一 ID（UUID） */
  eventId?: string;
  /** 一次调用的关联键（后端 streamSend 生成，贯穿本轮全部事件） */
  replyId?: string;
  /** 服务端发出时间（Unix 毫秒） */
  ts?: number;
  /** delta: 文本增量；reasoning: 思考增量 */
  text?: string;
  /** tool_call / tool_result: 工具调用信息 */
  toolCall?: ToolCall;
  /** tool_approval: 工具调用审批请求 */
  toolApproval?: ToolApprovalRequest;
  /** diff: 文件修改 diff 块 */
  diff?: DiffPatch;
  /** agent_status: Agent 运行时状态 */
  agentStatus?: AgentRunStatus;
  /** agent_routed: 默认模式意图路由结果（方案B） */
  agentRouted?: { agentId: string; agentName: string; method: 'RULE' | 'LLM' };
  /** nl2sql_result: NL2SQL 查询结果（前端渲染表格/图表，sql 字段已脱敏为 null） */
  sqlResult?: import('./api/nl2sql').SqlResultVO;
  /** references: RAG 检索引用列表（先于 delta/done 推送，渲染"参考来源"角标） */
  references?: MessageReference[];
  /** reflection: 反思轮次列表（旧契约：完成后一次推数组） */
  rounds?: ReflectionRound[];
  /** exceed_max_iters: 超限轮次（T14） */
  iters?: number;
  /** reflection: 单轮实时事件（P2 新契约：检索进行中逐轮推） */
  round?: number;
  gapQueries?: string[];
  error?: string;
}

// ============================================================================
// P0 能力扩展：Diff 审批 / 工具审批 / Agent 运行时
// ============================================================================

/**
 * Diff 行类型（对齐 unified diff 语义）
 * - context: 上下文行（未变更）
 * - add: 新增行
 * - delete: 删除行
 */
export type DiffLineType = 'add' | 'context' | 'delete';

/** Diff 单行（行级 diff 的最小单元） */
export interface DiffLine {
  /** 在 diff 块中的序号（0-based） */
  index: number;
  type: DiffLineType;
  /** 旧文件行号（context/delete 有值） */
  oldLineNumber?: number;
  /** 新文件行号（context/add 有值） */
  newLineNumber?: number;
  /** 行内容（不含换行符） */
  content: string;
}

/**
 * Diff 块状态（驱动审批 UI）
 * - pending: 待审批（默认）
 * - accepted: 全部接受
 * - rejected: 全部拒绝
 * - partial: 部分接受（按行接受后仍有未决行）
 */
export type DiffBlockStatus =
  | 'accepted'
  | 'partial'
  | 'pending'
  | 'rejected';

/**
 * Diff 块审批动作（用户操作）
 * - accept: 接受（全部行）
 * - reject: 拒绝（全部行）
 * - accept_line: 接受单行（按行接受）
 * - reject_line: 拒绝单行
 */
export type DiffAction = 'accept' | 'accept_line' | 'reject' | 'reject_line';

/**
 * 单个文件的 Diff 补丁（一个 diff StreamChunk 携带一个 DiffPatch）
 * 对齐后端契约：后端推送文件级 diff，前端渲染并收集审批结果。
 */
export interface DiffPatch {
  /** 唯一标识（前端生成 uuid，便于多 diff 块管理） */
  id: string;
  /** 文件路径（相对项目根） */
  filePath: string;
  /** 文件语言（用于语法高亮，如 'typescript' / 'vue' / 'json'） */
  language?: string;
  /** 旧文件内容 hash（用于冲突检测） */
  oldHash?: string;
  /** 新文件内容 hash */
  newHash?: string;
  /** diff 行列表（unified diff 解析后的结构化数据） */
  lines: DiffLine[];
  /** 统计信息 */
  stats: { additions: number; deletions: number };
  /** 审批状态 */
  status: DiffBlockStatus;
  /** 按行接受/拒绝的记录（行 index -> 是否接受） */
  lineDecisions?: Record<number, boolean>;
  /** 关联的消息 ID（嵌入在哪个助手消息中） */
  messageId?: string;
  /** 错误信息（应用失败时） */
  error?: string;
  /** 创建时间戳 */
  createdAt: number;
}

/**
 * 工具调用审批请求（高风险工具执行前的授权确认）
 * 参考 Cursor/Claude Code 的工具审批机制：AI 提议执行 -> 用户确认 -> 执行。
 */
export interface ToolApprovalRequest {
  /** 审批请求 ID（后端生成，用于回调） */
  approvalId: string;
  /** 关联的 ToolCall ID */
  toolCallId: string;
  /** 工具名称（如 'bash' / 'write_file' / 'mcp__github__create_pr'） */
  toolName: string;
  /** 工具来源 */
  source: ToolSource;
  /** MCP 服务器名（source='mcp' 时有值） */
  serverName?: string;
  /** 工具参数（展示给用户确认） */
  args: Record<string, any>;
  /** 风险等级（驱动 UI 强调程度） */
  risk: 'high' | 'low' | 'medium';
  /** 风险说明（如"将执行 rm -rf 命令"） */
  riskDescription?: string;
  /** 审批状态 */
  status: 'approved' | 'pending' | 'rejected';
  /** 审批超时时间戳（超时自动拒绝） */
  expiresAt?: number;
}

/**
 * Agent 运行时状态（嵌入在 agent_status StreamChunk 中）
 * 描述 Agent 多轮迭代的实时进度。
 */
export interface AgentRunStatus {
  /** Agent ID */
  agentId: string;
  /** 当前迭代轮次（1-based） */
  iteration: number;
  /** 最大迭代轮次 */
  maxIterations: number;
  /** 运行状态 */
  phase:
    | 'completed'
    | 'error'
    | 'idle'
    | 'planning'
    | 'running'
    | 'waiting_approval'
    | 'waiting_diff_review';
  /** 当前正在执行的工具名（phase='running' 时有值） */
  currentTool?: string;
  /** 本轮思考摘要（可选，展示在状态栏） */
  thought?: string;
  /** 累计 token 消耗 */
  tokensUsed?: { input: number; output: number };
  /** 错误信息（phase='error' 时有值） */
  error?: string;
}

// ============================================================================
// 模块二：Skill 管理
// ============================================================================

/** Skill 分类 */
export type SkillCategory =
  /**
   * 内置分类（向后兼容）。运行时也允许自定义分类（由 t_ai_skill_category 动态管理），
   * 因此类型上放宽为 (已知值 | string)，避免动态分类触发类型错误。
   */
  | 'database-search'
  | 'custom'
  | (string & {});

/** Skill 参数（简化版 JSON Schema） */
export interface SkillParameter {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: Array<{ label: string; value: string }>;
}

/** Skill（技能/斜杠命令） */
export interface Skill {
  id: string;
  name: string;
  description: string;
  /** 图标，iconify 名称 */
  icon: string;
  category: SkillCategory;
  /** Prompt 模板，支持 {{var}} 占位符 */
  promptTemplate: string;
  parameters: SkillParameter[];
  /** 允许调用的工具集（builtin tools + MCP tools） */
  allowedTools: string[];
  /** 触发关键词，用于 / 斜杠命令匹配 */
  triggerKeywords: string[];
  enabled: boolean;
  isBuiltin: boolean;
  version?: string;
  /** 调用次数统计 */
  usageCount: number;
  updatedAt: number;
}

// ============================================================================
// 模块三：Agents 管理（参考 dify Agent + App 模式）
// ============================================================================

/** 文件访问范围 */
export type FileScope = 'cwd' | 'global' | 'none';

/** Agent 工具调用策略（参考 dify function_calling / react） */
export type AgentStrategy = 'function_calling' | 'react';

/** Agent 权限配置 */
export interface AgentPermissions {
  fileRead: FileScope;
  fileWrite: FileScope;
  commandExec: boolean;
  /** 命令白名单（commandExec 为 true 时生效） */
  commandWhitelist: string[];
}

/** Agent 模型参数 */
export interface AgentModelParams {
  temperature: number;
  maxTokens: number;
  topP: number;
}

/** 敏感信息脱敏预设规则标识（内置） */
export type DesensitizePresetKey =
  | 'address'
  | 'apiKey'
  | 'bankCard'
  | 'email'
  | 'idCard'
  | 'ip'
  | 'password'
  | 'phone';

/**
 * 敏感信息脱敏规则（与后端 DesensitizeRuleDTO 对齐）
 * - 预设规则：仅填 key + enabled，后端翻译为脱敏说明
 * - 自定义规则：key='custom' + enabled + label + pattern（正则）
 */
export interface DesensitizeRule {
  key: DesensitizePresetKey | (string & {});
  enabled: boolean;
  /** 自定义规则名称（预设规则可留空） */
  label?: string;
  /** 自定义规则正则匹配模式（预设规则可留空） */
  pattern?: string;
}

/**
 * 输出优化配置（与后端 outputOptimization 字段对齐）
 * 优化管道第 2b 阶段：对脱敏后的文本进行 LLM 二次语义优化
 */
export interface OutputOptimization {
  enabled: boolean;
  /** 优化指令（如"将回复调整为更正式的商务语气"） */
  instructions: string;
}

/** Agent（智能体） */
export interface Agent {
  id: string;
  name: string;
  /** 头像 emoji 或 iconify 名称 */
  avatar: string;
  description: string;
  routeKeywords?: string;
  systemPrompt: string;
  /** 敏感信息脱敏规则（聊天上下文 / 用户消息中命中的敏感信息按规则脱敏） */
  desensitizeRules: DesensitizeRule[];
  /** 输出优化配置（可选，LLM 二次语义优化） */
  outputOptimization?: OutputOptimization;
  allowedTools: string[];
  allowedMcpServers: string[];
  allowedSkills: string[];
  /** 允许检索的知识库 ID 列表（参考 dify dataset_retrieval 工具） */
  allowedKnowledgeBases: string[];
  /** 允许的数据源 ID（null=全局不限定；[]=显式禁用全部 db 源；P2-T6） */
  allowedDatasources?: null | string[];
  modelId: string;
  modelParams: AgentModelParams;
  /** 工具调用策略 */
  strategy: AgentStrategy;
  /** 最大迭代轮次（React 模式下生效） */
  maxIterations: number;
  permissions: AgentPermissions;
  isBuiltin: boolean;
  enabled: boolean;
  /** 主题色（用于头像背景） */
  color?: string;
  usageCount: number;
  updatedAt: number;
}

// ============================================================================
// 模块四：MCP 管理（参考 dify MCP 集成 + 三种认证方式）
// ============================================================================

/** MCP 传输类型 */
export type McpTransport = 'sse' | 'stdio' | 'streamable-http';

/** MCP 连接状态 */
export type McpStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

/** 工具审批策略 */
export type ApprovalPolicy = 'always' | 'once' | 'never';

/** MCP 身份转发模式（参考 dify identity_mode） */
export type IdentityMode = 'off' | 'idp_token';

/** MCP OAuth 认证配置（参考 dify MCPAuthentication） */
export interface McpAuthentication {
  clientId: string;
  /** 脱敏存储 */
  clientSecretMasked?: string;
  /** 是否启用动态注册 */
  isDynamicRegistration?: boolean;
  /** OAuth Token 端点 */
  tokenEndpoint?: string;
}

/** MCP 超时配置（参考 dify MCPConfiguration） */
export interface McpConfiguration {
  /** 请求超时（秒），默认 30 */
  timeout: number;
  /** SSE 读取超时（秒），默认 300 */
  sseReadTimeout: number;
}

/** MCP 工具 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: string;
  approvalPolicy: ApprovalPolicy;
}

/** MCP 资源 */
export interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

/** MCP 提示模板 */
export interface McpPrompt {
  name: string;
  description: string;
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
}

/** MCP Server（对齐 dify MCPProviderBasePayload） */
export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: McpTransport;
  /** stdio 传输 */
  command?: string;
  args?: string[];
  env?: Array<{ key: string; value: string }>;
  /** sse / http 传输 */
  url?: string;
  headers?: Array<{ key: string; value: string }>;
  /** OAuth 认证（streamable-http / sse 传输可选） */
  authentication?: McpAuthentication;
  /** OAuth Client Secret（明文，仅提交时使用，后端 AES 加密落库） */
  clientSecret?: string;
  /** 超时与连接配置 */
  configuration: McpConfiguration;
  /** 身份转发模式 */
  identityMode: IdentityMode;
  /** 服务器标识符（唯一标识 MCP 服务器） */
  serverIdentifier?: string;
  status: McpStatus;
  lastError?: string;
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  enabled: boolean;
  updatedAt: number;
}

// ============================================================================
// 模块五：知识库管理（参考 dify Dataset / RAG 模块）
// ============================================================================

/** 分块结构类型（对齐 dify IndexStructureType） */
export type ChunkStructureType =
  | 'text_model'
  | 'qa_model'
  | 'hierarchical_model';

/** 索引技术（对齐 dify IndexTechniqueType） */
export type IndexTechnique = 'high_quality' | 'economy';

/** 检索方法（对齐 dify RetrievalMethod） */
export type RetrievalMethod =
  | 'semantic_search'
  | 'full_text_search'
  | 'hybrid_search'
  | 'keyword_search';

/** Reranking 模式（对齐 dify RerankingModeEnum） */
export type RerankingMode = 'reranking_model' | 'weighted_score';

/** 加权评分策略（对齐 dify WeightedScoreEnum） */
export type WeightedScoreType =
  | 'semantic_first'
  | 'keyword_first'
  | 'customized';

/** 父子分块模式（对齐 dify ParentMode） */
export type ParentMode = 'full_doc' | 'paragraph';

/** 预处理规则 ID（对齐 dify pre_processing_rules） */
export type PreProcessingRuleId =
  | 'remove_extra_spaces'
  | 'remove_urls_emails'
  | 'remove_stopwords';

/** 预处理规则 */
export interface PreProcessingRule {
  id: PreProcessingRuleId;
  enabled: boolean;
}

/** 分块配置（对齐 dify Segmentation + Rule） */
export interface ChunkConfig {
  /** 分块结构类型 */
  structure: ChunkStructureType;
  /** 分隔符，默认 \n */
  separator: string;
  /** 最大分块长度（tokens） */
  maxTokens: number;
  /** 重叠长度（tokens） */
  chunkOverlap: number;
  /** 预处理规则 */
  preProcessingRules: PreProcessingRule[];
  /** 父子模式下的父块模式（仅 hierarchical_model 生效） */
  parentMode?: ParentMode;
  /** 子分块配置（仅 hierarchical_model 生效） */
  subChunkSeparator?: string;
  subChunkMaxTokens?: number;
}

/** Reranking 模型配置 */
export interface RerankingModelConfig {
  rerankingProviderName: string;
  rerankingModelName: string;
}

/** 加权评分配置 */
export interface WeightedScoreConfig {
  weightType: WeightedScoreType;
  vectorSetting: {
    vectorWeight: number;
    embeddingProviderName: string;
    embeddingModelName: string;
  };
  keywordSetting: {
    keywordWeight: number;
  };
}

/** 检索模型配置（对齐 dify RetrievalModel） */
export interface RetrievalModelConfig {
  searchMethod: RetrievalMethod;
  rerankingEnable: boolean;
  rerankingMode?: RerankingMode;
  rerankingModel?: RerankingModelConfig;
  weights?: WeightedScoreConfig;
  topK: number;
  scoreThresholdEnabled: boolean;
  scoreThreshold?: number;
}

/** 知识库状态 */
export type KbStatus = 'ready' | 'indexing' | 'error' | 'empty';

/** 文档处理状态（对齐 dify Document.display_status） */
export type DocStatus =
  | 'pending'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'failed';

/** 文档类型 */
export type DocType = 'pdf' | 'docx' | 'txt' | 'md' | 'code' | 'html';

/** 知识库（对齐 dify Dataset） */
export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  /** 索引技术 */
  indexTechnique: IndexTechnique;
  /** Embedding 模型 ID */
  embeddingModelId: string;
  /** Embedding 模型提供商 */
  embeddingModelProvider?: string;
  /** 分块配置 */
  chunkConfig: ChunkConfig;
  /** 检索模型配置 */
  retrievalModel: RetrievalModelConfig;
  documentCount: number;
  totalChunks: number;
  status: KbStatus;
  createdAt: number;
  updatedAt: number;
}

/** 知识库文档（对齐 dify Document） */
export interface KnowledgeDocument {
  id: string;
  kbId: string;
  name: string;
  type: DocType;
  /** 文件大小（字节） */
  size: number;
  status: DocStatus;
  chunkCount: number;
  /** 处理进度 0-100 */
  progress?: number;
  /** 错误信息 */
  error?: string;
  /** 字数 */
  wordCount?: number;
  /** token 数 */
  tokens?: number;
  /** 索引耗时（ms） */
  indexingLatency?: number;
  uploadedAt: number;
}

/** 文档分段（对齐 dify DocumentSegment） */
export interface DocumentSegment {
  id: string;
  documentId: string;
  kbId: string;
  position: number;
  content: string;
  wordCount: number;
  tokens: number;
  /** QA 模式下的答案 */
  answer?: string;
  enabled: boolean;
  status: 'waiting' | 'completed' | 'error' | 'indexing';
  hitCount: number;
}

/** 检索测试结果（对齐 dify HitTesting） */
export interface RetrievalResult {
  documentId: string;
  documentName: string;
  segmentId: string;
  chunkIndex: number;
  content: string;
  /** QA 模式下的答案 */
  answer?: string;
  /** 相似度分数 0-1 */
  score: number;
  /** 命中次数 */
  hitCount?: number;
  /** 子分块（父子模式下） */
  childChunks?: Array<{ content: string; score: number }>;
}
