# 已知陷阱与防御

来自 2026-08 开发过程中的真实事故。每篇按「现象 → 根因 → 修复 → 防御」四段完整复盘——这些坑在组件宿主接入时同样会踩到。

| # | 陷阱 | 影响面 |
|---|---|---|
| 1 | [CORS 端口口径](/guide/pitfalls/cors) | 开发环境联调 |
| 2 | [出站数字字符串化](/guide/pitfalls/serialization) | 后端 ↔ LLM 网关 |
| 3 | [SSE 异步派发误杀](/guide/pitfalls/sse-async) | 流式对话 |
| 4 | [pnpm file: vs link:](/guide/pitfalls/pnpm-file) | 本地组件库联动 |

::: tip 已固化为回归测试
陷阱 2 和相关的审计字段问题（ createTime 全库 NULL）已固化为 JUnit 回归测试，在 CI 中永久守护——详见各篇「防御」段。
:::
