# 陷阱 4：pnpm file: vs link:

## 现象

本地组件库代码改了、构建了，但宿主项目（门户/demo）引用的仍是**旧版本**——新功能不生效、排障走进死胡同。

## 根因

pnpm 的 `file:` 协议是**复制快照**而非软链接——`pnpm install` 时把组件库当前状态复制一份到 node_modules，之后组件库的任何重建都**不会传导**到宿主。Vite 的依赖预打包缓存（`node_modules/.vite/deps`）还会再缓存一份旧代码，双重陈旧。

## 修复

1. **依赖协议改 `link:`**（真软链，dist 重建刷新页面即生效）：

```json
{
  "dependencies": {
    "@jarvis/ai-assistant": "link:../jarvis-ai-assistant"
  }
}
```

2. **Vite 排除预打包**（每次请求直读最新 dist）：

```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['@jarvis/ai-assistant'],
  },
});
```

3. 重启 dev server + 清缓存：

```bash
rm -rf node_modules/.vite
pnpm dev
```

## 防御

- 本地组件库联调一律 `link:` + `optimizeDeps.exclude`
- 改了库代码但宿主没反应 → 先 `realpath node_modules/@jarvis/ai-assistant` 确认指向源目录
- 记住：`file:` = 复制快照（安装时刻），`link:` = 软链接（实时同步）
