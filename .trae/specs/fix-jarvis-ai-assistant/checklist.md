# 整改验证清单

## P0 级（严重）— 已修复验证

- [x] P0-1 SSE 协议解析：`doStream` 按 `\n\n` 切分事件，`onEvent` 收到结构化 `{type, data}`
- [x] P0-1 SSE 向后兼容：`onChunk`/`onMessage` 收到 data 字段纯文本内容
- [x] P0-1 SSE 分片边界：UTF-8 字符跨多个 chunk 时拼接正确（TextDecoder stream:true）
- [x] P0-2 HttpAdapter 接入：`doRequest` 中当 `aiConfig.http?.request` 存在时走 adapter 而非 fetch
- [x] P0-2 HttpAdapter 流式：`doStream` 中 adapter 获得 `stream: true` 参数
- [x] P0-3 classifyError：`TypeError` 归类为 `'network'`
- [x] P0-3 classifyError：`AbortError` 归类为 `'timeout'`
- [x] P0-3 classifyError：`HTTP 4xx/5xx` 归类为 `'http'`

## P1 级（高）— 已修复验证

- [x] P1-1 导出完整性：`api/index.ts` 包含 `nl2sql` 和 `perception` 导出
- [x] P1-2 SSR 安全：`setAiBaseUrl`/`resetAiBaseUrl` 有 `typeof localStorage` 守卫
- [x] P1-3 配置优先级：`resolveBaseURL` 优先使用 `config.baseURL`
- [x] P1-4 exports 修正：`./modules/*` 映射到 `*.d.ts`/`*.js` 而非 `*/index.*`

## P2 级（中）

- [x] P2-1 X-Tenant-Id：维持现状，无代码改动
- [x] P2-2 regex 缓存：`loadPerceptionConfigs` 预编译 regex 到 `compiledRegexCache`
- [x] P2-3 config prop：`<AiAssistant :config>` 组件收到配置并 `provide` 给子组件
- [x] P2-4 AbortController：chat 模块 `onUnmounted` 时调用 `abortController?.abort()`
- [x] P2-4 AbortController：`uploadDocument` 支持传递 `AbortSignal`

## P3 级（低）

- [x] P3-1 demo 测试：`jarvis-ai-assistant-demo` 编排了 SSE 流式对话测试场景（About.vue）
- [x] P3-1 demo 测试：demo 编排了健康检查状态切换测试场景
- [x] P3-1 demo 测试：demo 编排了 HttpAdapter 注入测试场景
- [x] P3-1 demo 测试：demo 编排了页面感知测试场景
- [x] P3-2 发布流程：`.changeset` 或 `standard-version` 配置完成（`.changeset/config.json` + `.changeset/init.md`）
- [x] P3-2 发布产物：`package.json` `files` 字段确认发布产物完整（dist + README + CHANGELOG + LICENSE）
- [x] P3-3 lint 配置：组件库独立 `.eslintrc.cjs` + `.prettierrc` + `.prettierignore`

## 编译验证

- [x] `pnpm type-check` 通过（exit=0），无类型错误
- [ ] `pnpm build` 通过，构建产物正常（依赖后端 dist 构建，按需执行）