/**
 * T6-U1 单测：markdown-it 渲染器（安全 + 结构 + 旧类名兼容）。
 */
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown';

describe('renderMarkdown（markdown-it + DOMPurify）', () => {
  it('标题/表格/链接/有序列表正确渲染', () => {
    const html = renderMarkdown(
      '## 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[链接](https://x.com)\n\n1. one\n2. two',
    );
    expect(html).toContain('<h2>标题</h2>');
    expect(html).toContain('<table>');
    expect(html).toContain('href="https://x.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('<ol>');
  });

  it('无序列表保留旧版 md-ul 类名；行内代码保留 md-inline-code', () => {
    const html = renderMarkdown('- 甲\n- 乙\n\n`code`');
    expect(html).toContain('<ul class="md-ul">');
    expect(html).toContain('<code class="md-inline-code">code</code>');
  });

  it('围栏代码块：md-code-* 结构 + 复制按钮 + 高亮 span', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\n```');
    expect(html).toContain('class="md-code-wrap"');
    expect(html).toContain('class="md-code-lang">ts<');
    expect(html).toContain('<button type="button" class="md-code-copy">复制</button>');
    expect(html).toContain('class="hljs"');
    expect(html).toContain('const');
  });

  it('未支持语言的代码块：转义展示且结构完整', () => {
    const html = renderMarkdown('```weirdlang\n<script>alert(1)</script>\n```');
    expect(html).toContain('class="md-code-wrap"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('XSS：脚本/事件属性/Dangerous 协议无可执行形态', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[点我](javascript:alert(1))',
    );
    // html:false：原始 HTML 一律转义为字面文本；链接协议校验拦截 javascript:（退化为纯文本）
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });

  it('空输入返回空串', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
