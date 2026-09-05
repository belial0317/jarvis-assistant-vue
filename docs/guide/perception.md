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


## 宿主业务上下文注入（T6，权威感知源）

宿主把「当前用户/正在查看的业务对象」显式注入组件，后端注入【宿主业务上下文】块并声明**优先于 DOM 页面内容**：

```ts
// 方式一：静态配置
createAiAssistant({ businessContext: { userId: 'u1', bizObjectType: 'order', bizObjectId: 'ORD-1', payload: { amount: 66600 } } })

// 方式二：实例方法（业务对象随路由切换时动态更新）
const ai = ref<InstanceType<typeof AiAssistant>>();
ai.value.setBusinessContext({ userId: 'u1', roles: ['operator'], bizObjectType: 'order', bizObjectId: 'ORD-2', payload: { status: '处理中' } });
ai.value.clearBusinessContext();
```

约束：`payload` 仅扁平标量（string/number/boolean），序列化总量 ≤ 2000 字符，超限**显式抛错/拒绝**（前后端一致）。`signature` 字段为 JWT/HMAC 签名预留位（防伪造增强，本期未启用）。

## 用户选中文本（T3，指哪问哪）

用户在宿主页面选中文本后提问，选中内容随消息上行（DTO `selectedText`，≤2000 字符），后端注入【用户选中】块并声明优先参考。行为要点：

- **塌陷保留**：选中后点击抽屉按钮导致选区塌陷，已捕获文本保留至新的非空选区出现；
- 密码框/输入框内选区不采集（敏感输入不外泄）；
- 无选中不携带该字段。

## 感知开关（T4）

- 会话工具栏「感知」开关：关闭后**停止全部采集**，发送体不含 pageContext/pageSnapshot/selectedText/sessionTrail/hostContext 任何感知字段；
- 用户偏好持久化 `localStorage: ai_assistant_perception_enabled`；宿主缺省值 `config.perception.defaultEnabled`（敏感宿主可配 `false`）；
- 敏感防护：`input/textarea/select/option` 整元素不参与文本提取（用户输入值不外泄）。

## 感知优化飞轮（F1~F3）

「感知优化」页提供闭环运营入口：

| 环节 | 端点 | 说明 |
|---|---|---|
| 度量 | POST /perception/metrics/batch · GET /summary | 采集/摘要/反馈事件落表，按路由聚合 |
| 目标 | /perception/goals（CRUD + scheduler/run） | 规则建卡（7d 失败率>20% 或点踩>15% 且样本≥5）、优先级排序、3 次达标归档 |
| 草稿 | /perception/drafts（approve/reject） | 提议/生效分离：批准才写正式配置并推进 ETag |
| QA 沉淀 | /perception/fewshots | route 前缀匹配 TOP3 注入【相似问答】；无命中不注入 |
| 选择器推荐 | 前端启发式（recommend.ts） | 分析当前页候选主内容区 → 草稿入库待审（不自动生效） |

治理约束（G2）：感知资产全部查询/注入带租户显式条件，`tenant_id` 行级过滤实现前禁止跨租户汇聚。
