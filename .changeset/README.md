# Changesets

本目录使用 [Changesets](https://github.com/changesets/changesets) 管理版本与变更日志。

## 快速上手

### 添加变更说明

```bash
pnpm changeset
```

按提示选择版本类型（major / minor / patch）并撰写变更描述。

### 发布版本

```bash
# 1. 提交变更说明后，version 自动生成 CHANGELOG.md 和 version 字段更新
pnpm version

# 2. build + 发布到 npm
pnpm release
```

## 版本规范

- **major（破坏性变更）**：HttpAdapter 接口调整、SSE 回调语义变化
- **minor（新功能）**：新增按需引入模块、新增可观察性 hooks
- **patch（修复）**：错误分类修正、SSR 安全修复、性能优化

## 当前初始化变更

`.changeset/init.md` 记录项目从内嵌到独立组件库的首个变更点。