# @jarvis/ai-assistant

框架无关的 Vue 3 AI 助手组件库。支持任意 Vue 3 + ant-design-vue 项目通过 npm/pnpm 引入。

## 快速开始

### 安装

```bash
pnpm add @jarvis/ai-assistant
```

### 依赖

| 包 | 版本 |
|---|---|
| `vue` | `^3.4.0` |
| `ant-design-vue` | `^4.2.0` |
| `@iconify/vue` | `^4.1.0 \|\| ^5.0.0` |

### 全功能引入

```ts
// main.ts
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import { createAiAssistant, AiAssistant } from '@jarvis/ai-assistant';
import '@jarvis/ai-assistant/style.css';

const app = createApp(App);
app.use(Antd);

app.use(
  createAiAssistant({
    baseURL: '/ai-api',
    auth: {
      getToken: () => {
        // 返回当前用户的 Bearer token
        return useAccessStore().accessToken;
      },
    },
  }),
);
```

```vue
<!-- 布局文件中挂载 -->
<template>
  <AiAssistant ref="aiRef" />
</template>

<script setup>
import { ref } from 'vue';
import { AiAssistant } from '@jarvis/ai-assistant';
const aiRef = ref();
// aiRef.value.toggle()  — 切换抽屉
// aiRef.value.open     — 读写抽屉状态
</script>
```

### 配置项

```ts
interface AiAssistantConfig {
  /** AI 后端基础地址，默认 '/ai-api' */
  baseURL?: string;
  /** 鉴权提供者：返回当前用户的 Bearer token */
  auth?: AuthProvider;
  /** HTTP 适配器：不提供时使用内建 fetch */
  http?: HttpAdapter;
  /** 国际化提供者：返回语言代码，默认 'zh-CN' */
  locale?: LocaleProvider;
  /** 路由上下文提供者：用于页面感知（可选，不提供时降级） */
  route?: RouteContextProvider;
  /** 主内容区 DOM 选择器，默认 '#__vben_main_content' */
  mainContentSelector?: string;
  /** 错误通知回调：不提供时使用 ant-design-vue message.error */
  onError?: (message: string) => void;
}
```

### 按需引入

```ts
// 只引入类型
import type { ChatMessage, Agent, McpServer } from '@jarvis/ai-assistant';

// 只引入 composable
import { useBackendHealth, checkBackendHealth } from '@jarvis/ai-assistant';
```

## 功能模块

| 模块 | 说明 |
|------|------|
| **Chat** | 多会话 AI 对话工作台，支持 SSE 流式、多模型、Agent 切换、页面感知 |
| **Agent** | Agent 管理（新建/编辑/删除/启停/测试对话） |
| **Skill** | 技能管理（分类/Prompt 模板/触发词/授权工具） |
| **MCP** | MCP 服务器管理（stdio/SSE/HTTP 连接/工具刷新） |
| **Knowledge** | 知识库管理（文档上传/索引/检索/分段管理） |
| **Provider** | 模型供应商管理（连通性测试/模型列表） |
| **Perception** | 页面感知配置（路由匹配/策略配置） |
| **NL2SQL Audit** | SQL 审计日志 + 反馈闭环 |
| **Settings** | 全局设置（后端地址/外观/对话/通知/快捷键） |

## 开发

```bash
pnpm dev        # 构建监听模式
pnpm build      # 生产构建
pnpm type-check # 类型检查
```

## License

MIT