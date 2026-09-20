/**
 * Markdown 渲染器（T6-U1：tasks-2609-1020-20）。
 *
 * markdown-it + highlight.js 语法高亮 + DOMPurify 消毒：
 * - 支持标题/表格/链接/有序无序列表/引用/图片/围栏代码块（语言标签 + 复制按钮）；
 * - 复制按钮为静态标记，点击行为由 message-item.vue 的事件委托实现（.md-code-copy）；
 * - 输出经 DOMPurify 消毒，v-html 消费安全；
 * - 顶层类名（md-code-wrap/md-code-head/md-code-lang/md-code-copy/md-code/
 *   md-inline-code/md-ul）与旧版保持一致，既有样式零迁移。
 *
 * ⚠️ 输入是模型输出（不可信来源），禁止绕过 sanitize 直接 v-html。
 */
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight: (str, lang) => {
    const langNorm = (lang || '').trim().toLowerCase();
    try {
      if (langNorm && hljs.getLanguage(langNorm)) {
        return hljs.highlight(str, { language: langNorm, ignoreIllegals: true }).value;
      }
    } catch {
      // 高亮失败退回纯转义（下方 renderer 兜底）
    }
    return '';
  },
});

/** 围栏代码块：保留旧版 md-code-* 结构（语言标签 + 复制按钮 + 高亮 code） */
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!;
  const lang = (token.info || '').trim().split(/\s+/)[0] || 'text';
  const langNorm = lang.toLowerCase();
  let body: string;
  try {
    if (langNorm !== 'text' && hljs.getLanguage(langNorm)) {
      body = hljs.highlight(token.content, { language: langNorm, ignoreIllegals: true }).value;
    } else {
      body = md.utils.escapeHtml(token.content);
    }
  } catch {
    body = md.utils.escapeHtml(token.content);
  }
  return (
    `<div class="md-code-wrap">` +
    `<div class="md-code-head"><span class="md-code-lang">${md.utils.escapeHtml(lang)}</span>` +
    `<button type="button" class="md-code-copy">复制</button></div>` +
    `<pre class="md-code"><code class="hljs">${body}</code></pre>` +
    `</div>`
  );
};

/** 行内代码：保留旧版 md-inline-code 类名；内容为产物下载 URL 时渲染为可点击链接（LLM 常把 URL 包在反引号内） */
md.renderer.rules.code_inline = (tokens, idx) => {
  const content = tokens[idx]!.content;
  if (ARTIFACT_URL_TEST.test(content)) {
    return `<a href="${md.utils.escapeHtml(content)}" target="_blank" rel="noopener noreferrer">下载产物</a>`;
  }
  return `<code class="md-inline-code">${md.utils.escapeHtml(content)}</code>`;
};

/** markdown-it 渲染规则签名（@types/markdown-it 未给 rules 键提供上下文类型，显式声明） */
type MdRenderFn = (
  tokens: any[],
  idx: number,
  options: any,
  env: any,
  self: { renderToken: (tokens: any[], idx: number, options: any) => string },
) => string;

/** 链接：新窗口打开 + 安全 rel */
const defaultLinkOpen = md.renderer.rules.link_open as MdRenderFn | undefined;
md.renderer.rules.link_open = ((tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank');
  tokens[idx]!.attrSet('rel', 'noopener noreferrer');
  if (defaultLinkOpen) {
    return defaultLinkOpen(tokens, idx, options, env, self);
  }
  return self.renderToken(tokens, idx, options);
}) as MdRenderFn;

/** 无序列表：补旧版 md-ul 类名（样式沿用） */
const defaultBulletListOpen = md.renderer.rules.bullet_list_open as
  | MdRenderFn
  | undefined;
md.renderer.rules.bullet_list_open = ((tokens, idx, options, env, self) => {
  tokens[idx]!.attrJoin('class', 'md-ul');
  if (defaultBulletListOpen) {
    return defaultBulletListOpen(tokens, idx, options, env, self);
  }
  return self.renderToken(tokens, idx, options);
}) as MdRenderFn;

/** 消毒白名单：常规 markdown 输出 + hljs 的 span/code 结构 */
const PURIFY_CONFIG = {
  ALLOWED_ATTR: ['class', 'href', 'src', 'alt', 'title', 'target', 'rel', 'type'],
  ALLOWED_TAGS: [
    'a', 'abbr', 'b', 'blockquote', 'br', 'button', 'caption', 'code', 'dd', 'del', 'div', 'dl',
    'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
    'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub',
    'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
  ],
};

/** 产物下载 URL（相对路径）：markdown-it linkify 只识别 http(s)://，需预处理为链接语法。
 *  排除反引号包裹的（code_inline renderer 负责转链接，避免双重替换）。 */
const ARTIFACT_URL_RE = /(?<!\]\()(?<!`)(\/ai-api\/chat\/artifacts\/\d+\/download)(?!`)/g;
/** 非全局版（code_inline renderer 用，避免 lastIndex 状态） */
const ARTIFACT_URL_TEST = /^\/ai-api\/chat\/artifacts\/\d+\/download$/;

/** 把纯文本中的产物下载地址替换为可点击链接（已是 markdown 链接/反引号内的不动） */
function linkifyArtifactUrls(src: string): string {
  return src.replace(ARTIFACT_URL_RE, '[下载产物]($1)');
}

export function renderMarkdown(src: string): string {
  if (!src) return '';
  const raw = md.render(linkifyArtifactUrls(src));
  return DOMPurify.sanitize(raw, PURIFY_CONFIG);
}
