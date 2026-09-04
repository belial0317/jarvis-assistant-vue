# 组件 Props

## AiAssistant

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `rootClassName` | `string` | `''` | 抽屉根容器额外 class（主题定制入口） |
| `config` | `AiAssistantConfig` | — | 局部配置（优先于全局 `createAiAssistant` 注入） |

## AiAssistantConfig

| 字段 | 类型 | 说明 |
|---|---|---|
| `baseURL` | `string` | AI 服务端根地址（默认 `/ai-api`） |
| `auth` | `AuthProvider` | 身份注入（getToken / getTenantId） |
| `http` | `HttpAdapter` | HTTP/SSE 适配器（复用宿主请求封装） |
| `locale` | `LocaleProvider` | 国际化（默认 zh-CN） |
| `route` | `RouteContextProvider` | 路由上下文（页面感知数据源） |
| `models` | `string[]` | 控制台模型列表（下拉唯一源） |
| `settings` | `{ serviceUrlVisible?, apiKeyVisible? }` | 设置模块字段可见性管控 |
| `syncParams` | `{ baseURL?, apiKey?, defaultModel? }` | 挂载时同步写入设置存储 |
| `mainContentSelector` | `string` | 主内容区 DOM 选择器（页面感知提取） |
| `onError` | `(msg: string) => void` | 错误通知回调 |

## 暴露方法

通过 `defineExpose` 暴露（模板 ref 调用）：

| 方法 | 说明 |
|---|---|
| `toggle()` | 切换抽屉开/关 |
| `open` | 抽屉当前开合状态（可赋值） |

```vue
<script setup lang="ts">
import { AiAssistant } from '@jarvis/ai-assistant';
import { ref } from 'vue';

const assistant = ref<InstanceType<typeof AiAssistant>>();
// 编程式打开抽屉
function open() {
  assistant.value!.open = true;
}
</script>

<template>
  <AiAssistant ref="assistant" />
</template>
```
