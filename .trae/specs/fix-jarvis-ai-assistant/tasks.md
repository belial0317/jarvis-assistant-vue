# Tasks

## 已完成任务（P0 + P1 + P2-2/3）

- [x] Task 1: 修复 SSE 协议解析（P0-1）
  - 重写 `doStream` 函数，按 `\n\n` 切分事件
  - 解析 `data:` / `event:` 字段
  - 新增 `onEvent` 回调，保持 `onChunk`/`onMessage` 向后兼容
  - 文件：`src/api/client.ts`

- [x] Task 2: 接入 HttpAdapter（P0-2）
  - `doRequest` 开头检查 `aiConfig.http?.request`，委托调用
  - `doStream` 开头检查 `aiConfig.http?.request`，传递 `stream: true`
  - 文件：`src/api/client.ts`

- [x] Task 3: 重写 classifyError（P0-3）
  - 从 axios 字段判断改为 fetch 错误特征
  - TypeError -> 'network', AbortError -> 'timeout', HTTP 前缀 -> 'http'
  - 文件：`src/composables/use-backend-health.ts`

- [x] Task 4: 补全 API 导出（P1-1）
  - `api/index.ts` 追加 `export * from './nl2sql'` 和 `export * from './perception'`
  - 文件：`src/api/index.ts`

- [x] Task 5: 修复 SSR 安全（P1-2）
  - `setAiBaseUrl` 和 `resetAiBaseUrl` 增加 `typeof localStorage` 守卫
  - 文件：`src/api/client.ts`

- [x] Task 6: 修复配置优先级（P1-3）
  - `resolveBaseURL` 优先级改为 `config.baseURL` > localStorage > 默认值
  - 文件：`src/api/client.ts`

- [x] Task 7: 修复 exports 目录映射（P1-4）
  - `modules/*` 映射从 `*/index.*` 修正为 `*.d.ts`/`*.js`
  - 新增 `./modules/chat` 和 `./modules/chat/input-area` 精确映射
  - 文件：`package.json`

- [x] Task 8: 预编译 regex 缓存（P2-2）
  - `loadPerceptionConfigs()` 成功时预编译 regex 到 `compiledRegexCache` Map
  - `findConfig` 直接取缓存，避免重复 `new RegExp()`
  - 文件：`src/utils/page-context.ts`

- [x] Task 9: 实现 config prop（P2-3）
  - 组件新增 `config?: AiAssistantConfig` prop
  - 优先使用 prop 配置，否则 fallback 到全局注入
  - `provide(AI_ASSISTANT_CONFIG_KEY, resolvedConfig)`
  - 文件：`src/component.vue`

## 待完成任务

- [x] Task 10: 补全 AbortController 生命周期管理（P2-4）
  - chat 模块 `onUnmounted` 时调用 `abortController?.abort()`
  - `uploadDocument` 支持传递 `AbortSignal`
  - 文件：`src/modules/chat/index.vue`、`src/api/knowledge.ts`

- [x] Task 11: 基于 demo 项目的集成测试编排（P3-1）
  - 在 `jarvis-ai-assistant-demo` 中编排测试场景
  - 覆盖：SSE 流式对话、健康检查、HttpAdapter 注入、页面感知
  - 文件：`jarvis-ai-assistant-demo/` 相关文件

- [x] Task 12: 工程化建设（P3-2 + P3-3）
  - 加 `.changeset` 或 `standard-version` 发布流程
  - 确认 `package.json` `files` 字段发布产物完整
  - 组件库独立 `eslint.config.js` + `.prettierrc`

## 任务依赖

- Task 10 独立于其余任务，无依赖
- Task 11 依赖 Task 1-4 已完成（SSE/HttpAdapter/classifyError 修复需要 demo 验证）
- Task 12 独立于其余任务，无依赖
- Task 10 与 Task 11 可并行执行