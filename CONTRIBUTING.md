# 贡献指南 / Contributing

感谢关注本项目！欢迎以任何形式贡献：报告问题、完善文档、修复缺陷、新增能力。

## 开发环境

```bash
# 要求：Node ≥ 20，pnpm ≥ 9
pnpm install
pnpm dev          # 组件库构建（watch 模式）
pnpm test         # 单元测试
pnpm lint         # 代码检查
pnpm build        # 生产构建（含类型检查）
```

建议配合 `examples/` 下的宿主示例或你自己的工程进行联调。

## 分支与提交

- 分支命名：`feat/xxx`、`fix/xxx`、`docs/xxx`
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：
  `feat: 支持语音输入`、`fix: 修复流式中断后状态残留`、`docs: 补充多租户接入说明`
- 面向用户的破坏性变更必须通过 changeset 声明（`pnpm changeset`），并在 PR 描述中说明迁移方式

## PR 要求

1. 关联已有 Issue（或先提 Issue 讨论设计）
2. `pnpm test && pnpm build` 通过
3. 新增能力需附测试用例与文档更新
4. 不引入新的重量级依赖（讨论优先）
5. 保持 TypeScript 严格模式通过；避免 any 扩散

## 报告缺陷

请包含：组件版本、Vue/AntDV 版本、最小复现步骤、预期与实际行为、控制台报错。
涉及安全的问题请勿公开提 Issue，参见 [SECURITY.md](SECURITY.md)。

## 行为准则

参与社区请遵守 [行为准则](CODE_OF_CONDUCT.md)。
