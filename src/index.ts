/**
 * @jarvis/ai-assistant
 *
 * 框架无关的 Vue 3 AI 助手组件库。
 * 支持任意 Vue 3 + ant-design-vue 项目通过 npm/pnpm 引入。
 *
 * @example 全功能引入
 * ```ts
 * import { createAiAssistant, AiAssistant } from '@jarvis/ai-assistant';
 * import '@jarvis/ai-assistant/style.css';
 * import '@jarvis/ai-assistant/design-tokens.css';
 * import '@jarvis/ai-assistant/utilities.css';
 * ```
 */

// ===== 主组件 =====
export { default as AiAssistant } from './component.vue';

// ===== 依赖注入 =====
export {
  createAiAssistant,
  useAiAssistantConfig,
} from './providers/inject';

// ===== Provider 接口 =====
export type { AiAssistantConfig } from './providers/config';
export type { AuthProvider } from './providers/auth-provider';
export type {
  HttpAdapter,
  HttpRequestConfig,
  HttpResponse,
} from './providers/http-adapter';
export type { LocaleProvider } from './providers/locale-provider';
export type {
  RouteContext,
  RouteContextProvider,
} from './providers/route-provider';

// ===== 图标工具 =====
export { createIconifyIcon } from './providers/icons';

// ===== API 层（P0 修复：原 ./modules/* ./api/* 子路径产物缺失，统一并入根入口导出）=====
export * from './api';

// ===== 业务类型 =====
export type {
  AIModuleType,
  AIModuleMeta,
  MessageRole,
  MessageStatus,
  ToolSource,
  ToolStatus,
  ToolCall,
  ContextItem,
  ChatMessage,
  ChatSession,
  StreamChunk,
  DiffLineType,
  DiffLine,
  DiffBlockStatus,
  DiffAction,
  DiffPatch,
  ToolApprovalRequest,
  AgentRunStatus,
  ProviderType,
  ProviderStatus,
  ModelType,
  ProviderModel,
  Provider,
  SkillCategory,
  SkillParameter,
  Skill,
  FileScope,
  AgentStrategy,
  AgentPermissions,
  AgentModelParams,
  DesensitizePresetKey,
  DesensitizeRule,
  OutputOptimization,
  Agent,
  McpTransport,
  McpStatus,
  ApprovalPolicy,
  IdentityMode,
  McpAuthentication,
  McpConfiguration,
  McpTool,
  McpResource,
  McpPrompt,
  McpServer,
  ChunkStructureType,
  IndexTechnique,
  RetrievalMethod,
  RerankingMode,
  WeightedScoreType,
  ParentMode,
  PreProcessingRuleId,
  PreProcessingRule,
  ChunkConfig,
  RerankingModelConfig,
  WeightedScoreConfig,
  RetrievalModelConfig,
  KbStatus,
  DocStatus,
  DocType,
  KnowledgeBase,
  KnowledgeDocument,
  DocumentSegment,
  RetrievalResult,
} from './types';

// ===== Composables =====
export {
  useBackendHealth,
  checkBackendHealth,
  invalidateBackendHealth,
} from './composables/use-backend-health';
export type {
  BackendHealthState,
  BackendHealthSnapshot,
} from './composables/use-backend-health';

// ===== 工具函数 =====
export {
  capturePageContext,
  buildPageInsight,
  loadPerceptionConfigs,
} from './utils/page-context';
export type { PageInsight } from './utils/page-context';

// ===== 常量（UI 展示映射）=====
export {
  providerTypeOptions,
  modelTypeOptions,
  providerStatusMap,
  skillCategoryMap,
  skillCategoryOptions,
  scopeText,
  mcpStatusMap,
  mcpTransportMap,
  docTypeIcon,
  docStatusText,
  kbStatusText,
  modelTypeText,
} from './constants';