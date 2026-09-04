/**
 * PP2 策略层：可见文本提取（自 utils/page-context.ts 原样迁移，逻辑零改动）。
 * Golden 基线：src/perception/__snapshots__/golden.spec.ts.snap
 */

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

export function isElementVisible(el: Element): boolean {
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

export function extractVisibleText(root: HTMLElement): string {
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
    // S5/T4:表单元素整体跳过 —— input value 是 property 而非文本子节点,
    // textarea 的子节点文本会被框架回填为用户输入;一律不采集(敏感输入不外泄)
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return;
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
