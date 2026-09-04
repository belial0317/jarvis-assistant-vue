# 陷阱 1：CORS 端口口径

## 现象

前端页面请求后端 API，浏览器控制台显示 CORS 错误。`curl` 直接请求完全正常，但浏览器一律被拒。

## 根因

vite dev server 的 **proxy 默认保留 Origin 头**转发给后端。后端 CORS 白名单必须包含前端真实 Origin（含端口），但 Vite 端口被占用时会**自动 +1**（如 5668 → 5669），导致白名单外的端口被拒。

## 修复

后端 CORS 配置改用**端口通配模式**：

```java
registry.addMapping("/**")
    .allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*")
    .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
    .allowedHeaders("*")
    .allowCredentials(true);
```

## 防御

- 开发环境一律用通配模式，端口跳号免疫
- 生产环境由网关统一 CORS，后端不配置
- 联调时如果 curl 通、浏览器不通，第一件事查 Origin 头是否被 proxy 转发了白名单外的值
