#!/usr/bin/env node
/**
 * 提取所有 .vue 文件中实际使用的 CSS 类名（精确模式）
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'src';

function extractClasses(content) {
  const classRegex = /(?:class|:class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\{([^}]*)\}\}|\{([^}]+)\})/g;
  const matches = content.matchAll(classRegex);
  const results = [];

  for (const m of matches) {
    if (m[1]) results.push(...m[1].split(/\s+/));
    if (m[2]) results.push(...m[2].split(/\s+/));
    if (m[3] || m[4]) {
      const expr = m[3] || m[4];
      const stringRegex = /['"]([^'"]+)['"]/g;
      const strs = expr.matchAll(stringRegex);
      for (const s of strs) results.push(...s[1].split(/\s+/));
    }
  }
  return results.filter(Boolean);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (extname(full) === '.vue') yield full;
  }
}

const allClasses = new Set();
let fileCount = 0;

for (const file of walk(ROOT)) {
  fileCount++;
  const content = readFileSync(file, 'utf-8');
  for (const c of extractClasses(content)) {
    if (!c) continue;
    if (c.startsWith('!')) continue;
    if (c.startsWith('[')) continue;
    if (c.startsWith(':')) continue;
    if (/^['":{}()=,?]+$/.test(c)) continue;
    if (/^[A-Z_]+\[/.test(c)) continue;
    if (c.endsWith('?') || c.endsWith('.') || c.endsWith("'")) continue;
    if (c.includes('[') && !c.includes('\\')) continue;
    allClasses.add(c);
  }
}

const sorted = [...allClasses].sort();
const out = [];
out.push(`# Used classes (${fileCount} vue files)`);
out.push(`# Total: ${sorted.length}`);
out.push('');
for (const c of sorted) out.push(c);
writeFileSync('C:/Users/yidea/AppData/Local/Temp/used_tw_classes.txt', out.join('\n'));
console.log(`Extracted ${sorted.length} classes from ${fileCount} vue files`);