/**
 * T15-U7：生成 lucide 图标离线子集（icons.ts 运行时注册，摆脱 Iconify 在线拉取）。
 * 用法：node scripts/build-icon-subset.mjs（生成/刷新 src/providers/lucide-subset.ts）
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const collection = require('@iconify-json/lucide/icons.json');

// 1. 扫描源码中实际使用的 lucide 图标名
const used = new Set();
function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (/\.(vue|ts)$/.test(name.name)) {
      const matches = readFileSync(p, 'utf8').matchAll(/lucide:([a-z0-9-]+)/g);
      for (const m of matches) used.add(m[1]);
    }
  }
}
walk(join(process.cwd(), 'src'));

// 2. 从全集提取子集（缺失即显式报错，防止图标名拼写错误被静默吞掉）
const icons = {};
const aliases = {};
for (const name of [...used].sort()) {
  if (collection.icons[name]) {
    icons[name] = collection.icons[name];
  } else if (collection.aliases?.[name]) {
    // lucide 改名后的旧名以 alias 形式收录（如 alert-circle → circle-alert）
    aliases[name] = collection.aliases[name];
    const parent = collection.aliases[name].parent;
    if (!collection.icons[parent]) throw new Error(`别名父图标不存在: ${name} -> ${parent}`);
    icons[parent] = collection.icons[parent];
  } else {
    throw new Error(`lucide 中不存在图标: ${name}`);
  }
}

// 3. 生成 TS 模块（避免 resolveJsonModule 配置依赖）
const ts = `/**
 * T15-U7：lucide 离线图标子集（由 scripts/build-icon-subset.mjs 自动生成，勿手改）。
 * 新增图标后运行：node scripts/build-icon-subset.mjs
 * 未收录的图标仍走 Iconify API 在线兜底。
 */
import type { IconifyJSON } from '@iconify/vue';

export const lucideSubset: IconifyJSON = {
  prefix: 'lucide',
  icons: ${JSON.stringify(icons, null, 2)}${aliases ? `,
  aliases: ${JSON.stringify(aliases, null, 2)},` : ','}
  width: ${collection.width ?? 24},
  height: ${collection.height ?? 24},
};
`;
writeFileSync(join(process.cwd(), 'src/providers/lucide-subset.ts'), ts);
console.log(`lucide-subset.ts 生成完成：${Object.keys(icons).length} 个图标 + ${Object.keys(aliases).length} 个别名`);
