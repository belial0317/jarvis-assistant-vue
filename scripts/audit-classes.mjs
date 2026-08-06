#!/usr/bin/env node
/**
 * 对比 utilities.css 中定义的类与 .vue 文件中实际使用的类
 * 输出三类清单：unused / missing / used
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'src';

/* ========== 1. 提取 utilities.css 中定义的所有类 ========== */
const cssContent = readFileSync('src/styles/utilities.css', 'utf-8');
// 匹配 .class-name { 或 .class-name{ 形式
const definedClasses = new Set();
for (const m of cssContent.matchAll(/\.([\\:\.\-\w\/]+)\s*\{/g)) {
  // 反斜杠转义还原
  const cls = m[1].replace(/\\(.)/g, '$1');
  definedClasses.add(cls);
}

/* ========== 2. 提取 .vue 文件中使用的类 ========== */
function extractClasses(content) {
  const out = new Set();
  // 静态 class=""
  const staticRe = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of content.matchAll(staticRe)) {
    const str = m[1] || m[2];
    for (const c of str.split(/\s+/)) {
      if (c) out.add(c);
    }
  }
  // :class="" / :class=''
  for (const m of content.matchAll(/:class\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const str = m[1] || m[2];
    for (const c of str.split(/\s+/)) {
      if (c) out.add(c);
    }
  }
  // :class="..." 内嵌字符串字面量
  for (const m of content.matchAll(/:class\s*=\s*"([^"]+)"/g)) {
    const expr = m[1];
    for (const s of expr.matchAll(/'([^']+)'/g)) {
      for (const c of s[1].split(/\s+/)) {
        if (c) out.add(c);
      }
    }
  }
  return out;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (extname(full) === '.vue') yield full;
  }
}

const usedClasses = new Set();
for (const file of walk(ROOT)) {
  const content = readFileSync(file, 'utf-8');
  for (const c of extractClasses(content)) usedClasses.add(c);
}

/* ========== 3. 计算差集 ========== */
// 过滤 usedClasses：排除明显不是 CSS 的
const validUsed = new Set();
for (const c of usedClasses) {
  if (!c) continue;
  if (c.startsWith('!')) continue;
  if (c.startsWith('[')) continue;
  if (c.startsWith(':')) continue;
  if (c.startsWith('.')) continue;
  if (c.startsWith("'") || c.startsWith('"')) continue;
  if (c.endsWith('?') || c.endsWith("'") || c.endsWith('"') || c.endsWith(',')) continue;
  if (c.includes('(') || c.includes(')') || c.includes('`')) continue;
  if (c.includes('?.') || c.includes('?:')) continue;
  if (c === '<' || c === '>' || c === '||' || c === '&&') continue;
  // 排除 .foo
  if (c.startsWith('.')) continue;
  // 排除 ${var}、Vue 表达式
  if (c.includes('$') && c.includes('{')) continue;
  // 保留看起来像 Tailwind 类的：包含 - 或 [ 或 :
  if (!/[-:\[\]\\]/.test(c) && !c.includes('/')) continue;
  validUsed.add(c);
}

// unused: 定义了但没使用
const unused = [...definedClasses].filter((c) => !validUsed.has(c)).sort();

// missing: 使用了但没定义
const missing = [...validUsed].filter((c) => !definedClasses.has(c)).sort();

/* ========== 4. 输出 ========== */
const total = [...definedClasses].length;
const unusedCount = unused.length;
const usedCount = validUsed.size;
const missingCount = missing.length;

console.log(`=== CSS Class Audit ===`);
console.log(`Total defined in utilities.css: ${total}`);
console.log(`Actually used in .vue files:   ${usedCount}`);
console.log(`Unused (defined, not used):    ${unusedCount}`);
console.log(`Missing (used, not defined):   ${missingCount}`);
console.log(``);
console.log(`Usage rate: ${((1 - unusedCount / total) * 100).toFixed(1)}%`);
console.log(``);

writeFileSync(
  'C:/Users/yidea/AppData/Local/Temp/css_audit_unused.txt',
  ['# Unused CSS classes (defined but not used)', `# Count: ${unused.length}`, '', ...unused].join('\n'),
);
writeFileSync(
  'C:/Users/yidea/AppData/Local/Temp/css_audit_missing.txt',
  ['# Missing CSS classes (used but not defined)', `# Count: ${missing.length}`, '', ...missing].join('\n'),
);
writeFileSync(
  'C:/Users/yidea/AppData/Local/Temp/css_audit_used.txt',
  ['# Used CSS classes (in .vue)', `# Count: ${validUsed.size}`, '', ...[...validUsed].sort()].join('\n'),
);

console.log(`Reports written to:`);
console.log(`  - C:/Users/yidea/AppData/Local/Temp/css_audit_unused.txt`);
console.log(`  - C:/Users/yidea/AppData/Local/Temp/css_audit_missing.txt`);
console.log(`  - C:/Users/yidea/AppData/Local/Temp/css_audit_used.txt`);