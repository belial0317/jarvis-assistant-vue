# 快速开始

5 分钟内在你的 Vue 3 项目中嵌入完整的 AI 助手。

## 前置条件

- Vue ≥ 3.4
- ant-design-vue ≥ 4.2（peer 依赖）
- 后端：任意实现 [接口契约](/api/providers) 的服务（或使用配套的 jarvis-assistant-server 参考实现）

## 安装

```bash
pnpm add @jarvis/ai-assistant
```

## 三步接入

### 1. 入口注入配置

```ts
// main.ts
import { createApp } from 'vue';
import Antd from 'ant-design-vue';
import { createAiAssistant } from '@jarvis/ai-assistant';

// 样式（顺序：基础 → tokens → utilities）
import '@jarvis/ai-assistant/style.css';
import '@jarvis/ai-assistant/design-tokens.css';
import '@jarvis/ai-assistant/utilities.css';

import App from './app.vue';

const app = createApp(App);
app.use(Antd);
app.use(
  createAiAssistant({
    baseURL: '/ai-api',                       // AI 服务端地址（可走 vite 代理）
    auth: { getToken: () => authStore.token }, // 宿主注入身份
    locale: { getLocale: () => 'zh-CN' },
  }),
);
app.mount('#app');
```

### 2. 页面挂载

```vue
<!-- app.vue -->
<script setup lang="ts">
import { AiAssistant } from '@jarvis/ai-assistant';
</script>

<template>
  <div>
    <!-- 你的业务内容 -->
    <AiAssistant />
  </div>
</template>
```

### 3. 启动后端

如果还没有后端，使用参考实现：

```bash
git clone <jarvis-assistant-server>
cd jarvis-assistant-server
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

## 验证

启动项目后，页面出现 AI 助手悬浮入口。点击打开抽屉，顶部应显示「后端服务已连通」。

::: tip 健康检查失败？
确认 `baseURL` 指向的服务端正在运行。组件不会伪造连接状态——未连通时如实显示。
:::

## 下一步

- [接入指南](/guide/integration)：认证、路由、HTTP 适配器深度定制
- [模型路由](/guide/model-routing)：多模型管理与切换
- [已知陷阱](/guide/pitfalls/)：避开我们踩过的坑
