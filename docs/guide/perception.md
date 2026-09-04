# 页面感知

组件内置的差异化能力：自动提取用户正在浏览的页面内容，压缩后作为对话上下文。

## 工作流

```
路由变化 / 抽屉打开
    ↓
DOM 提取（mainContentSelector 指定的主内容区）
    ↓
本地压缩（自适应：大页面截断、关键内容保留）
    ↓
POST /chat/summarize-context（DOM 文本 + 路由 + 内容哈希）
    ↓
后端调 LLM：「用一句话概括页面核心信息」
    ↓
会话洞察卡显示一句话总结
```

## 配置

```ts
// 方式一：全局配置
createAiAssistant({
  mainContentSelector: '#main-content',
  route: createRouteProvider(router),
})

// 方式二：prop 配置
<AiAssistant :config="{ mainContentSelector: '#app-content' }" />
```

| 配置 | 说明 |
|---|---|
| `mainContentSelector` | 主内容区 DOM 选择器（默认 `#__vben_main_content`，Vben 宿主免配） |
| `route` | 路由上下文 Provider（感知「用户在哪个页面」的依据） |

## 摘要去重

组件每次导航生成内容哈希，后端 Redis 缓存（TTL 24h）——同一页面重复导航 **0 次 LLM 调用**。

## 降级行为

| 场景 | 行为 |
|---|---|
| 后端未连通 | 显示本地 DOM 统计（字数/元素数），不调 LLM |
| DOM 为空 | 回退路由信息（路径 + 标题）作为上下文 |
| LLM 超时/失败 | 返回截断文本兜底，不伪造总结 |

## 上下文注入

发送消息时，页面感知快照随请求上行（`pageContext` / `pageSnapshot` 字段），后端拼入 system prompt——模型能「看到」用户正在看的页面内容。
