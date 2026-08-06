#!/usr/bin/env node
/**
 * 过滤出真正的 CSS 类（去除 Vue 表达式里的变量、字符串字面量残片等）
 */
import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('C:/Users/yidea/AppData/Local/Temp/used_tw_classes.txt', 'utf-8').split('\n');

const isCssClass = (c) => {
  if (!c) return false;
  // 必须以小写字母或 - 开头
  if (!/^[-a-z]/.test(c)) return false;
  // 排除明显是表达式残留的
  if (c.startsWith('!')) return false;
  if (c.startsWith('[')) return false;
  if (c.startsWith(':')) return false;
  if (c.startsWith('.')) return false;
  if (c.endsWith('?') || c.endsWith("'") || c.endsWith('"')) return false;
  if (c.includes('(') || c.includes(')')) return false;
  if (c.includes('[') && !c.includes('\\')) return false; // [foo] 但保留 w-[42px]
  if (c === '<' || c === '>' || c === '+' || c === '||' || c === '&&' || c === "'") return false;
  // 排除 .method 链式调用
  if (/^[a-z]+\.[a-z]/.test(c) && c.includes('(')) return false;
  // 排除 propChain
  if (c.includes('?.') || c.includes('?:')) return false;
  // 排除 'foo' 字符串片段
  if (/^'/.test(c)) return false;
  // 排除 "foo",
  if (c.endsWith(',') && !c.includes('\\')) return false;
  return true;
};

const cssClasses = new Set();
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  if (isCssClass(trimmed)) cssClasses.add(trimmed);
}

const sorted = [...cssClasses].sort();
writeFileSync('C:/Users/yidea/AppData/Local/Temp/used_tw_pure.txt', sorted.join('\n'));
console.log(`Pure CSS classes: ${sorted.length}`);