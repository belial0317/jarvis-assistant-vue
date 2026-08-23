/**
 * PP2 策略层：三级自适应降级（自 utils/page-context.ts 原样迁移，逻辑零改动）。
 * 直出（<=1500）→ 压缩（<=3500）→ 摘要（超预算截断 + 处理说明）。
 */

const THRESHOLD_FULL = 1500;
const THRESHOLD_COMPRESSED = 3500;
const TEXT_BUDGET_IN_SUMMARY = 1500;

export function applyAdaptiveStrategy(content: string): string {
  const len = content.length;
  if (len <= THRESHOLD_FULL) {
    return content;
  }

  if (len <= THRESHOLD_COMPRESSED) {
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

  kept.push(...tableBlocks);

  let textBudget = TEXT_BUDGET_IN_SUMMARY;
  const meta: string[] = [];

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
