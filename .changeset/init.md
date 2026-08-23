---
'@jarvis/ai-assistant': minor
---

项目初始化：从 jarvis-ai-sys-web 内嵌 AI 助手重构为独立组件库 `@jarvis/ai-assistant`。

包含以下功能模块：
- 多会话 AI 对话工作台（SSE 流式、多模型、Agent 切换、页面感知）
- Agent / Skill / MCP / Knowledge / Provider / Perception / NL2SQL Audit / Settings 八大管理面板
- 框架无关：通过 `createAiAssistant(config)` 注入 Vue 应用

修复：
- P0-1 SSE 协议解析：重写 doStream 按 text/event-stream 协议解析事件
- P0-2 HttpAdapter 接入：自定义适配器现在可正确生效
- P0-3 classifyError：fetch 错误正确归类为 network/timeout/http
- P1-1 补全 nl2sql 和 perception 模块导出
- P1-2 setAiBaseUrl/resetAiBaseUrl 增加 SSR 安全守卫
- P1-3 resolveBaseURL 优先级改为 config.baseURL > localStorage > 默认
- P1-4 package.json exports 模块路径修正
- P2-2 regex 感知规则预编译缓存
- P2-3 <AiAssistant :config> prop 实现
- P2-4 AbortController 生命周期管理