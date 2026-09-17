import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// SDK 版本信息构建期注入（tasks-2609-1715-49 T3）：
// - __SDK_VERSION__：package.json version（CI 发布时已改写为 <tag>+<shortsha>，见 T6）
// - __SDK_PACKAGE__：npm包名（不同渠道包名不同）
// - __SDK_CHANNEL__：构建参数 SDK_CHANNEL，默认 oss；闭源商业版构建传 commercial
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string;
  name: string;
};

/**
 * 自定义插件：把 src/styles/*.css 当作静态资源 emit 到 dist
 *
 * vite library mode 默认不会 emit 未被引用的 CSS。
 * 本插件把这些 CSS 显式 emit 到 dist/styles/。
 */
function stylesEmitPlugin() {
  const STYLES = ['design-tokens.css', 'utilities.css'];
  return {
    name: 'jarvis-styles-emit',
    generateBundle(_options, _bundle) {
      for (const file of STYLES) {
        const id = resolve(__dirname, `src/styles/${file}`);
        const source = readFileSync(id, 'utf-8');
        this.emitFile({
          type: 'asset',
          fileName: `styles/${file}`,
          source,
        });
      }
    },
  };
}

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
    __SDK_PACKAGE__: JSON.stringify(pkg.name),
    __SDK_CHANNEL__: JSON.stringify(process.env.SDK_CHANNEL ?? 'oss'),
  },
  plugins: [
    vue(),
    stylesEmitPlugin(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      cleanVueFileName: true,
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'JarvisAiAssistant',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', 'ant-design-vue', '@iconify/vue', 'vue-router'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        exports: 'named',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? '';
          if (name.endsWith('.css')) {
            const baseName = name.replace(/^src\//, '').replace(/\.css$/, '');
            return `${baseName}.css`;
          }
          return name;
        },
      },
    },
    cssCodeSplit: false,
  },
});