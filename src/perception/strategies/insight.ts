/**
 * PP2 策略层：DOM 统计洞察（自 utils/page-context.ts 原样迁移，逻辑零改动）。
 * 本地统计不依赖后端，degraded 模式下仍可用。
 */

import type { PageInsight } from '../types';
import { extractVisibleText, isElementVisible } from './text';

export interface DomStats {
  tableCount: number;
  totalRows: number;
  descriptionItems: number;
  textLength: number;
}

export function analyzeDomStats(root: HTMLElement): DomStats {
  let tableCount = 0;
  let totalRows = 0;
  let descriptionItems = 0;

  root.querySelectorAll<HTMLElement>('.ant-table').forEach((t) => {
    if (!isElementVisible(t)) return;
    tableCount++;
    totalRows += t.querySelectorAll('.ant-table-tbody tr').length;
  });
  root.querySelectorAll<HTMLElement>('.ant-descriptions-item').forEach((d) => {
    if (isElementVisible(d)) descriptionItems++;
  });

  const textLength = extractVisibleText(root).length;

  return { tableCount, totalRows, descriptionItems, textLength };
}

export function buildInsight(title: string, stats: DomStats): PageInsight {
  const parts: string[] = [`已感知：${title}`];

  if (stats.tableCount > 0) {
    parts.push(
      `检测到 ${stats.tableCount} 个表格${
        stats.totalRows > 0 ? `（共 ${stats.totalRows} 行数据）` : ''
      }`,
    );
  }
  if (stats.descriptionItems > 0) {
    parts.push(`${stats.descriptionItems} 项结构化详情`);
  }
  if (stats.tableCount === 0 && stats.descriptionItems === 0) {
    const chars = Math.max(stats.textLength, 0);
    parts.push(chars > 0 ? `约 ${chars} 字符文本内容` : '暂无可识别内容');
  }

  return {
    description: parts.join(' · '),
    hints: generateHints(title, stats),
  };
}

function generateHints(title: string, stats: DomStats): string[] {
  if (stats.tableCount > 0 && stats.totalRows > 0) {
    return [
      `总结${title}的关键信息`,
      `对表格数据做统计分析`,
      `这份列表有哪些值得注意的点？`,
    ];
  }
  if (stats.descriptionItems > 0) {
    return [
      `梳理这份${title}的要点`,
      `帮我解读${title}内容`,
      `有哪些需要关注的信息？`,
    ];
  }
  return [`总结${title}的内容`, `提取关键信息`, `有什么值得注意的？`];
}
