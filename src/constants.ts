/**
 * AI 助手模块常量映射（UI 展示用，非 mock 数据）
 *
 * 这些常量是前端展示层的元数据（状态文本、颜色、图标映射），
 * 不依赖后端数据，从 mock/ 目录迁移而来以消除 mock 引用。
 */
import type {
  DocType,
  McpStatus,
  McpTransport,
  SkillCategory,
} from './types';

// ===== Provider =====
export const providerTypeOptions = [
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'OpenAI 兼容', value: 'openai-compatible' },
  { label: 'Ollama (本地)', value: 'ollama' },
  { label: '自定义', value: 'custom' },
] as const;

export const providerStatusMap: Record<
  string,
  { color: string; text: string }
> = {
  active: { color: 'success', text: '正常' },
  inactive: { color: 'default', text: '未启用' },
  error: { color: 'error', text: '异常' },
};

// ===== Skill =====
export const skillCategoryMap: Record<
  SkillCategory,
  { text: string; color: string }
> = {
  'database-search': { text: '数据库搜索', color: '#ec4899' },
  custom: { text: '自定义', color: '#6b7280' },
};

export const skillCategoryOptions = Object.entries(skillCategoryMap).map(
  ([value, { text }]) => ({ label: text, value }),
);

// ===== Agent =====
export const scopeText: Record<string, string> = {
  cwd: '工作区',
  global: '全局',
  none: '禁用',
};

// ===== MCP =====
export const mcpStatusMap: Record<
  McpStatus,
  { text: string; dot: string; text_color: string; bg: string }
> = {
  connected: {
    text: '已连接',
    dot: 'bg-emerald-500',
    text_color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
  },
  connecting: {
    text: '连接中',
    dot: 'bg-amber-500 animate-pulse',
    text_color: 'text-amber-600',
    bg: 'bg-amber-500/10',
  },
  disconnected: {
    text: '已断开',
    dot: 'bg-muted-foreground/40',
    text_color: 'text-muted-foreground',
    bg: 'bg-muted',
  },
  error: {
    text: '错误',
    dot: 'bg-red-500',
    text_color: 'text-red-500',
    bg: 'bg-red-500/10',
  },
};

export const mcpTransportMap: Record<McpTransport, { text: string; icon: string }> = {
  stdio: { text: 'stdio', icon: 'lucide:terminal' },
  sse: { text: 'SSE', icon: 'lucide:radio' },
  'streamable-http': { text: 'HTTP', icon: 'lucide:globe' },
};

// ===== Knowledge =====
export const docTypeIcon: Record<DocType, string> = {
  pdf: '📄',
  docx: '📘',
  txt: '📃',
  md: '📝',
  code: '💻',
  html: '🌐',
};

export const docStatusText: Record<string, { text: string; color: string }> = {
  pending: { text: '排队中', color: 'text-muted-foreground' },
  parsing: { text: '解析中', color: 'text-blue-500' },
  chunking: { text: '分块中', color: 'text-amber-500' },
  embedding: { text: '向量化', color: 'text-violet-500' },
  ready: { text: '就绪', color: 'text-emerald-500' },
  failed: { text: '失败', color: 'text-red-500' },
};

export const kbStatusText: Record<string, { text: string; dot: string }> = {
  ready: { text: '就绪', dot: 'bg-emerald-500' },
  indexing: { text: '索引中', dot: 'bg-amber-500 animate-pulse' },
  error: { text: '异常', dot: 'bg-red-500' },
  empty: { text: '空库', dot: 'bg-muted-foreground/40' },
};

// ===== Model Type =====
export const modelTypeOptions = [
  { label: '对话（Chat）', value: 'chat' },
  { label: '向量化（Embedding）', value: 'embedding' },
  { label: '重排序（Rerank）', value: 'rerank' },
  { label: '视觉（Vision）', value: 'vision' },
  { label: '语音合成（TTS）', value: 'tts' },
  { label: '语音识别（STT）', value: 'stt' },
] as const;

export const modelTypeText: Record<string, string> = {
  chat: '对话',
  embedding: '向量化',
  rerank: '重排序',
  vision: '视觉',
  tts: '语音合成',
  stt: '语音识别',
};
