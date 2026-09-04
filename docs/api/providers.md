# Provider 接口

## AuthProvider

```ts
interface AuthProvider {
  /** 返回 accessToken，注入 Authorization: Bearer 头 */
  getToken(): string | null | undefined;
  /** 可选：X-Tenant-Id 头（已认证请求以凭证内租户为准） */
  getTenantId?(): number | string | null | undefined;
}
```

## HttpAdapter

```ts
interface HttpAdapter {
  /** 自定义请求（非流式） */
  request(url: string, init?: HttpRequestConfig): Promise<HttpResponse>;
  /** 自定义 SSE 流式 */
  stream?(url: string, init: HttpRequestConfig & {
    onChunk: (text: string) => void;
    signal?: AbortSignal;
  }): Promise<void>;
}
```

## LocaleProvider

```ts
interface LocaleProvider {
  getLocale(): string; // 如 'zh-CN'
}
```

## RouteContextProvider

```ts
interface RouteContext {
  path: string;
  title: string;
  name: string;
  meta?: Record<string, unknown>;
}

interface RouteContextProvider {
  getRoute(): RouteContext;
  watchRoute?(cb: (route: RouteContext) => void): () => void; // 返回取消函数
}
```

## 后端 REST 契约（组件消费的端点）

| 端点 | 方法 | 用途 |
|---|---|---|
| `/chat/sessions` | GET / POST | 会话列表 / 创建与更新 |
| `/chat/sessions/{id}` | GET / DELETE | 会话详情 / 删除 |
| `/chat/sessions/{id}/messages` | GET / POST | 消息历史 / 发送消息 |
| `/chat/sessions/{id}/stream` | POST | SSE 流式对话 |
| `/chat/sessions/{id}/stop` | POST | 停止生成 |
| `/chat/summarize-context` | POST | 页面感知 LLM 摘要 |
| `/chat/diff/approve` | POST | Diff 审批 |
| `/chat/tool/respond` | POST | 工具调用审批 |
| `/agents/list` | GET | Agent 列表 |
| `/skills/list` | GET | Skill 列表 |
| `/knowledge/page` | GET | 知识库分页 |
| `/providers` | GET | 供应商与模型目录 |
| `/mcp/servers` | GET | MCP 服务器列表 |
| `/perception/configs` | GET | 页面感知配置 |
| `/health/ping` | GET | 连通性探测 |
