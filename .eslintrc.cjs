/**
 * ESLint 配置 - jarvis-ai-assistant 组件库
 *
 * 设计原则：
 * - 继承 Vue 3 官方推荐配置，专注 vue-tsc 编译
 * - 不强制和父工程 jarvis-ai-sys-web 的严格 ESLint 对齐（该工程风格偏向 Alibaba Java 规范，对组件库过严）
 * - 关键规则覆盖：错误捕获、类型安全、Vue 模板规范
 */

/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
  ],
  plugins: ['@typescript-eslint', 'vue'],
  rules: {
    // Vue 模板
    'vue/multi-word-component-names': 'off',
    'vue/html-self-closing': ['error', {
      html: { void: 'always', normal: 'always', component: 'always' },
      svg: 'always',
      math: 'always',
    }],
    'vue/max-attributes-per-line': ['warn', { singleline: 3, multiline: 1 }],
    'vue/singleline-html-element-content-newline': 'off',
    'vue/html-indent': 'warn',
    // TypeScript
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    // REST API enum：LIST/SAVE/DELETE 同路径是常见设计（方法区分），非重复定义
    '@typescript-eslint/no-duplicate-enum-values': 'off',
    // extractSSEEvents 的 while(true)+break 循环哨兵模式合法
    'no-constant-condition': ['error', { checkLoops: false }],
    // 通用
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'warn',
    'prefer-const': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
};