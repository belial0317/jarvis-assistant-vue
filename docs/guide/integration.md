# 接入指南

## Provider 体系

组件通过 Provider 注入适配宿主环境，全部可选但生产场景强烈建议注入 `auth`。

### auth（身份注入）

```ts
auth: {
  // 返回 Bearer token（组件无独立登录体系）
  getToken: () => authStore.accessToken,
  // 可选：返回租户 ID（服务端对已认证请求以 JWT 内租户为准，此头仅为开放端点保留）
  getTenantId: () => tenantStore.id,
}
```

::: warning 双通道鉴权
组件在异步回调（点击/await 之后）发起的请求走宿主全局兜底配置——如果宿主只在 prop 配置里注入 auth，异步请求可能缺少鉴权。组件库已做双通道回落（config.auth → 设置模块本地 Key），但建议宿主在 `createAiAssistant` 全局配置中也注入 auth。
:::

### http（HTTP 适配器）

```ts
http: {
  // 复用宿主已有的请求封装（如 axios 实例）
  request: async (url, init) => {
    const resp = await axios({ url, method: init.method, ...init });
    return { status: resp.status, json: () => resp.data };
  },
  // SSE 流式请求适配（可选）
  stream: async (url, init, onChunk, signal) => { /* ... */ },
}
```

### route（路由上下文）

```ts
import { Router } from 'vue-router';

route: {
  getRoute: () => {
    const r = router.currentRoute.value;
    return { path: r.path, title: r.meta.title, name: r.name, meta: r.meta };
  },
  watchRoute: (cb) => router.afterEach(() => cb(/* ... */)),
}
```

注入后组件的「页面感知」可自动携带用户当前页面上下文。

### models（模型列表）

```ts
models: ['glm-5.2', 'deepseek-v4-flash'],
```

配置后会话下拉以该列表为唯一模型源（值为模型名，openai-compatible 网关直传）。为空时回落供应商模型目录。

### settings（字段可见性管控）

```ts
settings: {
  serviceUrlVisible: false, // 隐藏组件设置中的「服务地址」字段
  apiKeyVisible: false,     // 隐藏「API Key」字段
}
```

管理端锁定后字段不显示也不可编辑，配置以宿主为唯一来源。

## 凭证体系

| 凭证 | 生存位置 | 职责 |
|---|---|---|
| 平台 Key（sk-jarvis-…） | 宿主/组件设置 | 组件调用平台服务端的门禁 |
| 模型 Key（sk-xxx） | 平台服务端供应商配置 | 后端调用模型服务的通行证 |

**组件永远不直接持有模型 Key**——它只以平台 Key 调用后端，后端再持模型 Key 调上游。

## 多租户

后端通过 JWT/API Key 内的 tenantId 做行级隔离，组件无需感知——只需确保凭证绑定了正确租户。

## 主题定制

```vue
<AiAssistant root-class-name="my-theme" />
```

```css
.my-theme .ant-drawer-content { background: #fafafa; }
.my-theme .bg-background { background: #fafafa; }
```

暗色主题：包裹 `ai-theme-dark` 或覆盖 design-tokens.css 变量。
