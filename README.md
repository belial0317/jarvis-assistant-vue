<div align="center">

# @jarvis/ai-assistant

**企业级 Vue 3 AI 助手组件库 —— 一个组件，让任何系统拥有完整 AI 助手**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Vue](https://img.shields.io/badge/Vue-3.4+-4FC08D.svg)](https://vuejs.org)
[![Ant Design Vue](https://img.shields.io/badge/AntDV-4.2+-1677FF.svg)](https://antdv.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org)

[快速开始](#-快速开始) · [特性](#-特性) · [接入指南](#-接入指南) · [Roadmap](#-roadmap)

</div>

---

## 简介

`@jarvis/ai-assistant` 是一个**可嵌入任意 Vue 3 系统的 AI 助手组件**：一个组件标签，为你带来完整的 AI 助手体验——多会话流式对话、Agent、知识库、MCP 工具、页面感知、用量统计，以及配套的管理控制台。

> 设计哲学：**组件负责体验，宿主负责身份，服务端负责模型**。通过 Provider 注入适配任何企业环境。

## 特性

- 即插即用：一个 `<AiAssistant />` 标签嵌入任意 Vue 3 页面，悬浮入口 + 完整抽屉
- 会话工作台：多会话、SSE 流式输出、工具调用 Diff 审批、停止/重试
- 多模型路由：供应商目录管理、多模型 + 默认模型、按名直传（openai-compatible）
- 知识库（RAG）：文档分块、检索增强
- 页面感知：DOM 上下文提取与压缩，随对话携带用户正在看的页面
- 三源感知（S7 新增）：宿主业务上下文注入（setBusinessContext，权威级）+ 用户选中文本「指哪问哪」+ DOM 自动感知
- 感知优化飞轮（S7 新增）：质量度量 → 规则建卡 → 评估报告 → 草稿审批 → QA 沉淀 → 选择器推荐，越用越准
- 企业特性：权限矩阵、多租户行级隔离、配额、用量统计、脱敏管道
- Provider 注入：HttpAdapter / Auth / Locale / RouteContext 全可定制
- 管理控制台（配套门户）：登录、API Key、用量看板、供应商管理、权限矩阵

## 快速开始

```bash
pnpm add @jarvis/ai-assistant
```

```ts
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import { createAiAssistant } from '@jarvis/ai-assistant';
import '@jarvis/ai-assistant/style.css';

const app = createApp(App);
app.use(Antd);
app.use(
  createAiAssistant({
    baseURL: '/ai-api',
    auth: { getToken: () => store.token },
    locale: { getLocale: () => 'zh-CN' },
  }),
);
```

```vue
<template>
  <!-- 页面任意位置：悬浮入口 + 助手抽屉 -->
  <AiAssistant />
</template>
```

## 配套生态

| 项目 | 说明 |
|---|---|
| jarvis-assistant-server | Spring Boot 参考后端（会话/模型路由/用量/配额/多租户）|
| jarvis-assistant-portal | 管理控制台门户（登录/系统设置/供应商管理）|

## Roadmap

- [x] 多模型 + 默认模型、会话切换
- [x] 用量统计与配额
- [ ] 多模态输入（图像/文件）
- [ ] i18n 语言包（中/英）
- [ ] headless 形态（去 AntDV 耦合）
- [ ] MCP 工具生态深化

## 贡献

欢迎 Issue 与 PR！请先阅读 [CONTRIBUTING](./CONTRIBUTING.md) 与 [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md)。

## License

[Apache-2.0](./LICENSE)
