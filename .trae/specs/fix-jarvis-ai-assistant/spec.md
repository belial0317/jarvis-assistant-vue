# jarvis-ai-assistant 项目整改 Spec

## Why

代码审计发现 jarvis-ai-assistant 组件库存在 14 项问题（P0-P3），涵盖 SSE 协议解析、HttpAdapter 接入、错误分类、导出完整性、SSR 安全、工程配置等维度。Gitee 仓库无登记 Issue，所有问题均基于本地代码静态审计。

## What Changes

### P0 级（严重）— 已修复
- SSE 流式解析：重写 doStream，按 text/event-stream 协议解析事件，支持 `data:`/`event:` 字段解析和 `onEvent` 回调
- HttpAdapter 接入：`doRequest`/`doStream` 开头判断 `aiConfig.http?.request`，优先委托给自定义 adapter
- classifyError 重写：从 axios 字段判断改为 fetch 错误特征（TypeError/AbortError/HTTP 前缀）

### P1 级（高）— 已修复
- api/index.ts 补导出 `nl2sql` 和 `perception` 模块
- `setAiBaseUrl`/`resetAiBaseUrl` 增加 `typeof localStorage` 守卫
- `resolveBaseURL` 优先级改为 `config.baseURL` > localStorage 动态地址 > 默认值
- `package.json` exports 的 `modules/*` 目录映射从 `*/index.*` 修正为 `*.d.ts`/`*.js`

### P2 级（中）
- P2-1 X-Tenant-Id：**已决策维持现状**，客户端不涉及租户逻辑
- P2-2 regex 缓存：**已修复**，`loadPerceptionConfigs()` 中预编译 regex 到 Map 缓存
- P2-3 `<AiAssistant :config>` prop：**已修复**，组件新增 `config?: AiAssistantConfig` prop，支持 prop 传入配置
- P2-4 AbortController 管理：**待修复**，chat 模块补 `onUnmounted` 生命周期清理，knowledge 上传支持 AbortSignal

### P3 级（低）
- P3-1 测试：**已决策** 通过 jarvis-ai-assistant-demo 项目进行集成验证
- P3-2 发布流程：**待修复**，加 `.changeset`，确认 `files` 发布产物
- P3-3 lint 配置：**待修复**，组件库独立 `eslint.config.js` + `.prettierrc`

## Impact

- Affected specs: SSE 流式对话、健康检查、HttpAdapter 注入、模块导出、SSR 兼容性、配置优先级、打包导出、感知配置性能、组件配置注入、生命周期管理
- Affected code:
  - `src/api/client.ts` — SSE 解析、HttpAdapter 接入、SSR 安全、配置优先级
  - `src/composables/use-backend-health.ts` — classifyError 重写
  - `src/api/index.ts` — 补导出
  - `src/utils/page-context.ts` — regex 缓存
  - `src/component.vue` — config prop
  - `src/modules/chat/index.vue` — onUnmounted
  - `src/api/knowledge.ts` — AbortSignal 支持
  - `package.json` — exports 修正
  - `.eslintrc` / `.prettierrc`（新增）— lint 配置
  - `.changeset`（新增）— 发布流程

## ADDED Requirements

### Requirement: SSE 协议解析
The system SHALL parse incoming SSE event stream correctly:
- 按 `\n\n` 切分事件
- 解析 `data:` / `event:` / `id:` / `retry:` 字段
- 提供 `onEvent` 回调接收结构化 `{type, data}` 事件
- 保持向后兼容：`onChunk`/`onMessage` 仍收到 data 字段纯文本

#### Scenario: SSE 流式对话正常运行
- **WHEN** 后端返回标准 SSE 格式 `event: delta\ndata: {"text":"hi"}\n\n`
- **THEN** `onEvent` 收到 `{type: "delta", data: '{"text":"hi"}'}`，`onChunk` 收到 `'{"text":"hi"}'`

### Requirement: HttpAdapter 注入
The system SHALL delegate HTTP requests to custom adapter when provided:
- `doRequest` 开头检查 `aiConfig.http?.request`，存在则委托
- `doStream` 检查 `aiConfig.http?.request`，存在则委托并传递 `stream: true`
- 无 adapter 时走内建 fetch

#### Scenario: 自定义 adapter 生效
- **WHEN** 宿主注入 `createAiAssistant({ http: { request: customAdapter } })`
- **THEN** 所有请求经过 `customAdapter`，而非内建 fetch

### Requirement: 错误分类准确
The system SHALL classify errors accurately for fetch-based requests:
- `TypeError: Failed to fetch` -> `'network'`
- `AbortError` -> `'timeout'`
- `HTTP 4xx/5xx` -> `'http'`
- 其余 -> `'unknown'`

#### Scenario: 后端离线时健康检查显示正确原因
- **WHEN** 后端不可达，fetch 抛 `TypeError: Failed to fetch`
- **THEN** `classifyError` 返回 `'network'`，StatusBar 显示"网络连接失败"

### Requirement: 组件支持 prop 传配置
The system SHALL accept configuration via `:config` prop on `<AiAssistant>`:
- prop 传入的配置覆盖全局注入的配置
- `provide(AI_ASSISTANT_CONFIG_KEY, resolvedConfig)` 确保子组件可获取

#### Scenario: 按需传入配置
- **WHEN** 宿主使用 `<AiAssistant :config="{ baseURL: '/custom' }" />` 且未安装插件
- **THEN** 子组件收到 `{ baseURL: '/custom' }` 配置

### Requirement: async 生命周期管理
The system SHALL clean up async resources on component unmount:
- chat SSE 流在 `onUnmounted` 时调用 `abortController?.abort()`
- `uploadDocument` 支持传递 `AbortSignal`

#### Scenario: 组件销毁时自动中断 SSE
- **WHEN** 用户关闭 AI 助手抽屉（chat 组件触发 `onUnmounted`）
- **THEN** `abortController?.abort()` 被调用，SSE 连接关闭

## MODIFIED Requirements

### Requirement: 配置优先级（已修复）
- 旧：`localStorage` 无条件覆盖 `config.baseURL`
- 新：`config.baseURL` > localStorage > 默认 `/ai-api`

### Requirement: 导出完整性（已修复）
- 旧：`api/index.ts` 漏导出 `nl2sql` 和 `perception`
- 新：完整导出所有 11 个 API 模块

## REMOVED Requirements

### Requirement: X-Tenant-Id 注入点
**Reason**: 客户端不涉及租户逻辑，key 通过后台管理程序申请
**Migration**: 无，维持现有 `'0'` 写死逻辑

### Requirement: 组件库内单元测试
**Reason**: 测试策略改为通过 jarvis-ai-assistant-demo 项目进行集成验证
**Migration**: 在 demo 项目中编排测试场景覆盖 SSE 流式对话、健康检查、HttpAdapter 注入、页面感知 4 个核心链路