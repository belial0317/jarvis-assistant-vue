const ELEMENT_ID_MAIN_CONTENT = '__vben_main_content';

import type { PerceptionConfigVO } from '../api/perception';

import { listPerceptionConfigs } from '../api/perception';

const THRESHOLD_FULL = 1500;
const THRESHOLD_COMPRESSED = 3500;
const MAX_TABLE_ROWS = 20;
const TEXT_BUDGET_IN_SUMMARY = 1500;

const NOISE_TAGS = new Set([
  'canvas',
  'i',
  'iframe',
  'noscript',
  'script',
  'style',
  'svg',
]);

const NOISE_CLASS_PATTERNS = [
  'ant-dropdown',
  'ant-drawer',
  'ant-modal',
  'ant-popover',
  'ant-tooltip',
];

const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'br',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);

let perceptionConfigs: PerceptionConfigVO[] = [];

export async function loadPerceptionConfigs(): Promise<void> {
  try {
    perceptionConfigs = await listPerceptionConfigs();
  } catch {
    perceptionConfigs = [];
  }
}

function findConfig(routePath: string): PerceptionConfigVO | null {
  for (const c of perceptionConfigs) {
    if (!c.enabled) continue;
    switch (c.matchType) {
      case 'exact': {
        if (routePath === c.routePattern) return c;
        break;
      }
      case 'prefix': {
        if (routePath.startsWith(c.routePattern)) return c;
        break;
      }
      case 'regex': {
        try {
          if (new RegExp(c.routePattern).test(routePath)) return c;
        } catch {
          // ignore invalid regex
        }
        break;
      }
    }
  }
  return null;
}

export function capturePageContext(routePath?: string): string {
  const root = document.getElementById(ELEMENT_ID_MAIN_CONTENT);
  if (!root) {
    console.warn('[page-context] root element #__vben_main_content not found');
    return '';
  }

  const config = routePath ? findConfig(routePath) : null;
  const strategy = config?.strategy ?? 'auto';

  let tableMd = '';
  let text = '';

  if (config && config.selectors.length > 0) {
    const targets: HTMLElement[] = [];
    for (const sel of config.selectors) {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (isElementVisible(el) && !targets.includes(el)) targets.push(el);
      });
    }
    const scope = targets.length > 0 ? targets : [root];

    if (strategy !== 'text_only') {
      tableMd = extractTablesFromScope(scope);
    }
    if (strategy !== 'table_only') {
      text = scope
        .map((el) => extractVisibleText(el))
        .filter(Boolean)
        .join('\n\n');
    }
  } else {
    if (strategy !== 'text_only') {
      tableMd = extractTablesFromScope([root]);
    }
    if (strategy !== 'table_only') {
      text = extractVisibleText(root);
    }
  }

  let combined = '';
  if (tableMd) combined += `${tableMd}\n\n`;
  if (text) combined += text;
  combined = combined.trim();
  if (!combined) return '';

  if (strategy === 'full') {
    console.debug(
      `[page-context] route=${routePath} strategy=full tableMd=${tableMd.length}ch text=${text.length}ch -> ${combined.length}ch`,
    );
    return combined;
  }

  const result = applyAdaptiveStrategy(combined);
  console.debug(
    `[page-context] route=${routePath} strategy=${strategy} tableMd=${tableMd.length}ch text=${text.length}ch combined=${combined.length}ch -> ${result.length}ch`,
  );
  return result;
}

function applyAdaptiveStrategy(content: string): string {
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

function extractTablesFromScope(scope: HTMLElement[]): string {
  const parts: string[] = [];
  const processed = new Set<Element>();
  for (const el of scope) {
    if (el.classList?.contains('ant-table')) {
      if (processed.has(el) || !isElementVisible(el)) continue;
      processed.add(el);
      const md = tableToMarkdown(el);
      if (md) parts.push(md);
      continue;
    }
    el.querySelectorAll('.ant-table').forEach((table) => {
      if (processed.has(table) || !isElementVisible(table)) return;
      processed.add(table);
      const md = tableToMarkdown(table as HTMLElement);
      if (md) parts.push(md);
    });
  }
  return parts.join('\n\n');
}

function tableToMarkdown(table: HTMLElement): string {
  const headerCells = table.querySelectorAll<HTMLElement>('.ant-table-thead th');
  const headers: string[] = [];
  headerCells.forEach((th) => {
    const text = th.textContent?.trim() || '';
    if (text) headers.push(text);
  });
  if (!headers.length) return '';

  const bodyRows = table.querySelectorAll<HTMLElement>('.ant-table-tbody tr');
  const totalRows = bodyRows.length;
  const visibleRows = Array.from(bodyRows).slice(0, MAX_TABLE_ROWS);

  const rows: string[][] = [];
  visibleRows.forEach((tr) => {
    if (!isElementVisible(tr)) return;
    const cells = tr.querySelectorAll('td');
    const row: string[] = [];
    cells.forEach((td) => row.push(td.textContent?.trim() || ''));
    if (row.length === headers.length) rows.push(row);
  });

  if (!rows.length) return '';

  const separator = headers.map(() => '---').join(' | ');
  let md = `| ${headers.join(' | ')} |\n| ${separator} |\n`;
  rows.forEach((row) => {
    md += `| ${row.join(' | ')} |\n`;
  });

  if (totalRows > MAX_TABLE_ROWS) {
    md += `\n[表格共 ${totalRows} 行，已展示前 ${rows.length} 行，省略了后 ${totalRows - rows.length} 行]\n`;
  }

  return md.trim();
}

function extractVisibleText(root: HTMLElement): string {
  const lines: string[] = [];

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text && text.trim()) {
        lines.push(text.trim());
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (NOISE_TAGS.has(tag)) return;
    if (tag === 'table' || el.classList?.contains('ant-table')) return;
    if (NOISE_CLASS_PATTERNS.some((cls) => el.classList?.contains(cls))) return;
    if (!isElementVisible(el)) return;

    for (const child of el.childNodes) {
      walk(child);
    }

    if (BLOCK_TAGS.has(tag) && lines.length > 0 && lines.at(-1) !== '') {
      lines.push('');
    }
  }

  walk(root);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isElementVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const pStyle = window.getComputedStyle(parent);
    if (pStyle.display === 'none') return false;
    parent = parent.parentElement;
  }
  return true;
}

export interface PageInsight {
  description: string;
  hints: string[];
}

interface DomStats {
  tableCount: number;
  totalRows: number;
  descriptionItems: number;
  textLength: number;
}

function analyzeDomStats(root: HTMLElement): DomStats {
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

export function buildPageInsight(
  routePath?: string,
  routeTitle?: string,
): PageInsight | null {
  const root = document.getElementById(ELEMENT_ID_MAIN_CONTENT);
  if (!root) return null;

  const config = routePath ? findConfig(routePath) : null;
  const scope: HTMLElement[] = [];

  if (config && config.selectors.length > 0) {
    for (const sel of config.selectors) {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (isElementVisible(el) && !scope.includes(el)) scope.push(el);
      });
    }
  }
  if (scope.length === 0) scope.push(root);

  const stats = scope
    .map((el) => analyzeDomStats(el))
    .reduce(
      (acc, s) => ({
        tableCount: acc.tableCount + s.tableCount,
        totalRows: acc.totalRows + s.totalRows,
        descriptionItems: acc.descriptionItems + s.descriptionItems,
        textLength: acc.textLength + s.textLength,
      }),
      { tableCount: 0, totalRows: 0, descriptionItems: 0, textLength: 0 },
    );

  const title = routeTitle || '当前页面';
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
