# 陷阱 2：出站数字字符串化

## 现象

对话接口返回「（LLM 不可用）」降级占位回复。后端日志显示 LLM 网关返回 400 Bad Request，但请求地址和 Key 都正确。curl 直接请求同一网关完全正常。

## 根因

后端 Jackson 全局配置了 `write-numbers-as-strings: true`（防止雪花 ID 在前端 JavaScript 中精度丢失）。同步 LLM 调用走 `WebClient.bodyValue(Map)` 时使用全局 ObjectMapper，导致请求体中的 `temperature` 被写成**字符串** `"0.7"` 而非数字 `0.7`——openai-compatible 网关严格校验类型，直接 400。

```json
// 发出的请求体（错误）
{"temperature": "0.7", "model": "glm-5.2"}
// 网关期望的
{"temperature": 0.7, "model": "glm-5.2"}
```

## 修复

出站第三方请求的序列化**禁用全局 Jackson**，改用 Hutool（Double 输出 JSON 数字）：

```java
// ❌ 走全局 Jackson（受 write-numbers-as-strings 影响）
webClient.post().bodyValue(requestBody)

// ✅ 显式序列化（Hutool 行为：数字就是数字）
webClient.post().bodyValue(JSONUtil.toJsonStr(requestBody))
```

## 防御

已固化为回归测试 `OutboundSerializationRegressionTest`：锁定 Hutool 对 Double/Integer 输出数字的行为——如果未来升级 Hutool 后此测试变红，说明序列化行为变化，必须重新评估所有出站链路。

**通用原则**：后端向第三方发送数字字段的请求体，一律显式序列化（Hutool / 独立 ObjectMapper），不走全局配置。
