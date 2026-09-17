/**
 * T18：轻量 i18n 字典（zh-CN / en）。
 *
 * 设计决策（t18 任务文件）：组件库保持零重依赖，不引 vue-i18n——
 * 字典为扁平 key → 文案映射，t(key) 按当前语言回退：en 缺失回退 zh-CN。
 */
import { reactive } from 'vue';

export type Locale = 'zh-CN' | 'en';

const zhCN: Record<string, string> = {
  'app.title': 'AI 助手',
  'nav.chat': '会话工作台',
  'nav.skill': 'Skill 管理',
  'nav.agent': 'Agents 管理',
  'nav.mcp': 'MCP 管理',
  'nav.knowledge': '知识库',
  'nav.perception': '感知中心',
  'nav.provider': '供应商管理',
  'nav.nl2sql': 'NL2SQL 审计',
  'nav.audit': '审计',
  'nav.settings': '设置',
  'chat.new': '新建会话',
  'chat.history': '会话历史',
  'chat.search': '搜索会话',
  'chat.send': '发送',
  'chat.stop': '停止生成',
  'chat.stopping': '停止中…',
  'chat.input.placeholder': '输入问题，Enter 发送 / Shift+Enter 换行；@ 引用上下文，/ 触发技能',
  'chat.group.pinned': '置顶',
  'chat.group.today': '今天',
  'chat.group.earlier': '更早',
  'chat.rename': '重命名',
  'chat.delete': '删除',
  'chat.empty.noMatch': '无匹配会话',
  'chat.thinking': '思考中…',
  'chat.thinkingDone': '思考',
  'chat.tasks': '任务列表',
  'chat.tasks.empty': '暂无任务——可让 AI 通过 task_create 工具创建',
  'app.state.connected': '已连接',
  'app.state.checking': '检测中',
  'app.state.disconnected': '未连接',
  'approval.title': '工具执行授权',
  'approval.reject': '拒绝',
  'approval.always': '始终允许',
  'approval.approve': '授权执行',
  'settings.backend': '后端服务',
  'settings.apiKey': 'API Key',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.loading': '加载中…',
  'common.retry': '重试',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.regenerate': '重新生成',
  // tasks-2609-1715-49 T5：SDK 升级提醒文案
  'sdk.update.new': '新版本 v',
  'sdk.update.close': '关闭本次提醒',
  'sdk.about.title': '关于',
  'sdk.about.current': '当前版本',
  'sdk.about.latest': '最新版本',
  'sdk.about.channel': 'SDK 渠道',
  'sdk.about.channel.oss': '开源版',
  'sdk.about.channel.commercial': '商业版',
};

const en: Record<string, string> = {
  'app.title': 'AI Assistant',
  'nav.chat': 'Chat',
  'nav.skill': 'Skills',
  'nav.agent': 'Agents',
  'nav.mcp': 'MCP',
  'nav.knowledge': 'Knowledge',
  'nav.perception': 'Perception',
  'nav.provider': 'Providers',
  'nav.nl2sql': 'NL2SQL Audit',
  'nav.audit': 'Audit',
  'nav.settings': 'Settings',
  'chat.new': 'New Chat',
  'chat.history': 'History',
  'chat.search': 'Search chats',
  'chat.send': 'Send',
  'chat.stop': 'Stop',
  'chat.stopping': 'Stopping…',
  'chat.input.placeholder':
    'Type a message. Enter to send, Shift+Enter for newline; @ for context, / for skills',
  'chat.group.pinned': 'Pinned',
  'chat.group.today': 'Today',
  'chat.group.earlier': 'Earlier',
  'chat.rename': 'Rename',
  'chat.delete': 'Delete',
  'chat.empty.noMatch': 'No matching chats',
  'chat.thinking': 'Thinking…',
  'chat.thinkingDone': 'Thought',
  'chat.tasks': 'Tasks',
  'chat.tasks.empty': 'No tasks yet — ask the AI to create one via task_create',
  'app.state.connected': 'Connected',
  'app.state.checking': 'Checking',
  'app.state.disconnected': 'Disconnected',
  'approval.title': 'Tool Approval',
  'approval.reject': 'Reject',
  'approval.always': 'Always allow',
  'approval.approve': 'Approve',
  'settings.backend': 'Backend',
  'settings.apiKey': 'API Key',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.regenerate': 'Regenerate',
  // tasks-2609-1715-49 T5：SDK 升级提醒文案
  'sdk.update.new': 'New version v',
  'sdk.update.close': 'Dismiss this reminder',
  'sdk.about.title': 'About',
  'sdk.about.current': 'Current version',
  'sdk.about.latest': 'Latest version',
  'sdk.about.channel': 'SDK channel',
  'sdk.about.channel.oss': 'Open source',
  'sdk.about.channel.commercial': 'Commercial',
};

const dicts: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
};

const state = reactive({ locale: 'zh-CN' as Locale });

export function setI18nLocale(locale: Locale): void {
  state.locale = locale;
}

export function getI18nLocale(): Locale {
  return state.locale;
}

/** 翻译：key 缺失回退 zh-CN，再缺失回退 key 本身 */
export function t(key: string): string {
  return dicts[state.locale][key] ?? zhCN[key] ?? key;
}
