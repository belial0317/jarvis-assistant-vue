/**
 * PP2 策略层：三级自适应降级（自 utils/page-context.ts 原样迁移，逻辑零改动）。
 * 直出（<=1500）→ 压缩（<=3500）→ 摘要（超预算截断 + 处理说明）。
 */

import { estimateTokens } from './estimate';

/**
 * S10/T5:三级降级阈值由「字符数」切换为「粗粒度 token 估算」。
 * - 中文 ≈1 字/token:行为与旧字符阈值一致(1500/3500);
 * - 英文 ≈4 字符/token:更早进入压缩(旧口径下英文页面 token 超预算约 4 倍);
 * - 摘要阶段块预算仍按字符(块内截断精度需求低)。
 */
const THRESHOLD_FULL_TOKENS = 1500;
const THRESHOLD_COMPRESSED_TOKENS = 3500;
const TEXT_BUDGET_IN_SUMMARY = 1500;
/** 摘要阶段表格块总预算（v1 P1-1：此前表格块全量保留，多表页面输出不可控） */
const TABLE_BUDGET_IN_SUMMARY = 2500;

export function applyAdaptiveStrategy(content: string): string {
  const tokens = estimateTokens(content);
  if (tokens <= THRESHOLD_FULL_TOKENS) {
    return content;
  }

  if (tokens <= THRESHOLD_COMPRESSED_TOKENS) {
    return compress(content);
  }

  return summarize(content);
}

function compress(content: string): string {
  return content
    .split('\n')
    .map((line) => line.replace(/\s{2,}/g, ' ').trimEnd())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

function summarize(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  const tableBlocks: string[] = [];
  const textBlocks: string[] = [];
  let currentBlock: string[] = [];
  let inTable = false;

  for (const line of lines) {
    if (line.startsWith('|')) {
      if (!inTable && currentBlock.length > 0) {
        textBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      inTable = true;
      currentBlock.push(line);
    } else {
      if (inTable && currentBlock.length > 0) {
        tableBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
      inTable = false;
      if (line.trim()) {
        currentBlock.push(line);
      } else if (currentBlock.length > 0) {
        textBlocks.push(currentBlock.join('\n'));
        currentBlock = [];
      }
    }
  }
  if (currentBlock.length > 0) {
    if (inTable) {
      tableBlocks.push(currentBlock.join('\n'));
    } else {
      textBlocks.push(currentBlock.join('\n'));
    }
  }

  const meta: string[] = [];

  // 表格块总预算：超预算时逐表截断（保留表头行，行数据截断并标注）
  let tableBudget = TABLE_BUDGET_IN_SUMMARY;
  let tableTruncated = 0;
  for (const block of tableBlocks) {
    if (tableBudget <= 0) {
      tableTruncated += 1;
      continue;
    }
    if (block.length > tableBudget) {
      const lines = block.split('\n');
      // 表格 markdown 首两行是表头与分隔线，务必保留
      const head = lines.slice(0, 2).join('\n');
      const bodyBudget = Math.max(0, tableBudget - head.length);
      kept.push(`${head}\n${lines.slice(2).join('\n').slice(0, bodyBudget)}…`);
      tableTruncated += 1;
      meta.push(`- 表格已截断：原表 ${block.length} 字符`);
      tableBudget = 0;
    } else {
      kept.push(block);
      tableBudget -= block.length;
    }
  }
  if (tableTruncated > 0 && tableBudget <= 0) {
    meta.push(`- 另有 ${tableTruncated} 个表格超出总预算被省略/截断（预算 ${TABLE_BUDGET_IN_SUMMARY} 字符）`);
  }

  let textBudget = TEXT_BUDGET_IN_SUMMARY;

  for (const block of textBlocks) {
    if (textBudget <= 0) {
      meta.push(`- 已省略部分文本内容（超出预算）`);
      break;
    }
    if (block.length > textBudget) {
      const truncated = block.slice(0, textBudget);
      kept.push(`${truncated}…`);
      meta.push(`- 文本已截断：原文 ${block.length} 字符，保留 ${textBudget} 字符`);
      textBudget = 0;
    } else {
      kept.push(block);
      textBudget -= block.length;
    }
  }

  if (meta.length > 0) {
    kept.push('\n【页面上下文处理说明】');
    kept.push(meta.join('\n'));
  }

  return kept.join('\n').trim();
}
