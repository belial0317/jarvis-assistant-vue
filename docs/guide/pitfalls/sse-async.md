# 陷阱 3：SSE 异步派发误杀

## 现象

流式对话内容正常输出完毕后，前端突然收到 `network error`。后端日志在对话结束的时间点出现：

```
AuthorizationDeniedException: Access Denied
"Unable to handle ... because the response is already committed"
```

## 根因

Spring Security 6 + SSE（Servlet 异步派发）的经典坑：流式响应完成后，**异步 dispatch 的安全过滤器链会重新执行鉴权**——异步线程上 SecurityContext 已丢失 → 误判拒绝 → 把已经开始的流掐断。

内容能出来、随后才报错，与现象完全吻合。

## 修复

SecurityConfig 放行 ASYNC 派发类型：

```java
.authorizeHttpRequests(auth -> auth
    // 初始请求已鉴权，异步派发不再重复鉴权
    .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ASYNC).permitAll()
    // ... 其他规则
)
```

## 防御

- 使用 SSE / Servlet 异步的端点，安全配置必须加 `dispatcherTypeMatchers(ASYNC).permitAll()`
- 症状识别法：**回复内容正常但随后 network error** + 后端日志 `response already committed` → 99% 是这个坑
