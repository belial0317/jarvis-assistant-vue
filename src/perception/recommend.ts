/**
 * S9/F4-a 选择器推荐:启发式分析当前页 DOM,生成候选主内容区选择器草稿。
 *
 * - 推荐结果一律写草稿(source=recommend)进审批流,**不自动生效**(人审闸门);
 * - 启发式:语义容器标签优先(main/article/section)→ 正文文本密度 →
 *   稳定 class(非框架哈希类)→ ant-design 内容容器;
 * - 纯浏览器侧计算,后端零参与(后端拿不到宿主 DOM)。
 */

export interface SelectorCandidate {
  selector: string;
  /** 文本密度得分(字符数) */
  chars: number;
  /** 推荐理由 */
  reason: string;
}

/** 候选语义标签(按优先级) */
const SEMANTIC_TAGS = ['main', 'article', 'section'];

/** 框架哈希类前缀(不稳定,不推荐) */
const UNSTABLE_CLASS = /^(css-|css-|sc-|jss-|makeStyles-|_[a-zA-Z0-9]{6,})/;

export function recommendSelectors(): SelectorCandidate[] {
  const candidates = new Map<string, SelectorCandidate>();

  const push = (selector: string, el: Element, reason: string): void => {
    if (candidates.has(selector)) return;
    const chars = ((el as HTMLElement).innerText ?? '').trim().length;
    if (chars < 200) return; // 内容过薄不推荐
    candidates.set(selector, { selector, chars, reason });
  };

  // 1. 语义标签
  for (const tag of SEMANTIC_TAGS) {
    const els = document.querySelectorAll(tag);
    if (els.length === 1) push(tag, els[0]!, `<${tag}> 语义容器(唯一)`);
  }

  // 2. ant-design 内容容器
  for (const sel of ['#__vben_main_content', '.ant-pro-page-container-children-container', '.ant-layout-content']) {
    const el = document.querySelector(sel);
    if (el) push(sel, el, `${sel} 框架内容容器`);
  }

  // 3. 正文密度:找出文本最重的元素,提取其稳定 class/id 选择器
  const all = document.querySelectorAll('div');
  let best: Element | null = null;
  let bestChars = 0;
  for (const el of all) {
    const chars = ((el as HTMLElement).innerText ?? '').trim().length;
    // 只看「叶子内容容器」:有大量文本但子 div 不多(避免命中 body/root)
    if (chars > bestChars && el.querySelectorAll('div').length < 30) {
      best = el;
      bestChars = chars;
    }
  }
  if (best) {
    const classList = [...best.classList].filter(
      (c) => !UNSTABLE_CLASS.test(c) && c.length > 2,
    );
    if (classList.length > 0) {
      push(`.${classList[0]}`, best, `正文密度最高容器的稳定 class(.${classList[0]},${bestChars} 字符)`);
    } else if (best.id) {
      push(`#${best.id}`, best, `正文密度最高容器的 id(#${best.id},${bestChars} 字符)`);
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 5);
}
