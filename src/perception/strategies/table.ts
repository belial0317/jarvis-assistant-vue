/**
 * PP2 策略层：ant-design 表格转 Markdown（自 utils/page-context.ts 原样迁移，逻辑零改动）。
 */

import { isElementVisible } from './text';

const MAX_TABLE_ROWS = 20;

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

export function extractTablesFromScope(scope: HTMLElement[]): string {
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
