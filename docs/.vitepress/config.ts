import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '@jarvis/ai-assistant',
  description: '企业级 Vue 3 AI 助手组件库',
  lang: 'zh-CN',
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/quick-start' },
      { text: 'API', link: '/api/component' },
      { text: 'GitHub', link: 'https://github.com/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '接入指南', link: '/guide/integration' },
          ],
        },
        {
          text: '进阶',
          items: [
            { text: '模型路由', link: '/guide/model-routing' },
            { text: '页面感知', link: '/guide/perception' },
          ],
        },
        {
          text: '已知陷阱与防御',
          items: [
            { text: '总览', link: '/guide/pitfalls/' },
            { text: 'CORS 端口口径', link: '/guide/pitfalls/cors' },
            { text: '出站数字字符串化', link: '/guide/pitfalls/serialization' },
            { text: 'SSE 异步派发误杀', link: '/guide/pitfalls/sse-async' },
            { text: 'pnpm file: vs link:', link: '/guide/pitfalls/pnpm-file' },
          ],
        },
      ],
      '/api/': [
        { text: '组件 Props', link: '/api/component' },
        { text: 'Provider 接口', link: '/api/providers' },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/' },
    ],
  },
});
