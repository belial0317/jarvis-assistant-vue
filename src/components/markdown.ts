/**
 * 极简 Markdown 渲染器（MVP 用，零依赖）。
 *
 * 仅处理 AI 回复中常见语法：围栏代码块、行内代码、加粗、无序列表、换行。
 * 后续接入后端后可替换为 md-editor-v3 等完整方案。
 *
 * 输入为可信的 Mock 文本，已做 HTML 转义，避免 XSS。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(s: string): string {
  // 行内代码 `xxx`
  let out = s.replace(/`([^`]+)`/g, (_, code) => {
    return `<code class="md-inline-code">${escapeHtml(code)}</code>`;
  });
  // 加粗 **xxx**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

export function renderMarkdown(src: string): string {
  if (!src) return '';

  const blocks: string[] = [];
  const lines = src.split('\n');

  let i = 0;
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push(`<p>${renderInline(escapeHtml(para.join(' ')))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push(`<ul class="md-ul">${list.map((l) => `<li>${renderInline(escapeHtml(l))}</li>`).join('')}</ul>`);
      list = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // 围栏代码块
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      flushPara();
      flushList();
      const lang = fence[1] ?? '';
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        code.push(lines[i]!);
        i += 1;
      }
      i += 1; // 跳过结束 ```
      blocks.push(
        `<div class="md-code-wrap">` +
          `<div class="md-code-head"><span class="md-code-lang">${escapeHtml(lang || 'text')}</span><span class="md-code-copy">复制</span></div>` +
          `<pre class="md-code"><code>${escapeHtml(code.join('\n'))}</code></pre>` +
          `</div>`,
      );
      continue;
    }

    // 无序列表
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      list.push(li[1]!);
      i += 1;
      continue;
    }

    // 空行
    if (line.trim() === '') {
      flushPara();
      flushList();
      i += 1;
      continue;
    }

    flushList();
    para.push(line.trim());
    i += 1;
  }
  flushPara();
  flushList();

  return blocks.join('');
}