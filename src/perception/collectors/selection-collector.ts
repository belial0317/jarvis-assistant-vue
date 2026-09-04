/**
 * S4/T3 选中文本采集器:用户显式引用信号的独立采集支路。
 *
 * 设计要点(见 tasks-2609-0423-47/T3 决策记录):
 * - selectionchange 监听 + 500ms 防抖,复用可见性门控由 manager 决定启停;
 * - 选区变化不触发全量 DOM 重采集(独立轻量信号,边界明确);
 * - 保留最后非空选中:用户选中后点击按钮打开抽屉会使选区塌陷(浏览器默认行为),
 *   此时不清空已捕获文本——选中保留至新的非空选区出现或 stop();
 * - 排除密码框/输入框内的选区(敏感输入不外泄,且显式清除已捕获值);上限 2000 字符;
 * - 不限定主内容区:弹窗/抽屉内的合法选中同样「指哪问哪」。
 */

const MAX_SELECTION_CHARS = 2000;
const DEBOUNCE_MS = 500;

export class SelectionCollector {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private current = '';

  constructor(private onChange: (text: string) => void) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('selectionchange', this.handle);
  }

  stop(): void {
    if (!this.started) return;
    document.removeEventListener('selectionchange', this.handle);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.started = false;
    this.current = '';
  }

  /** 当前选中(发送时刻读取;空串 = 无选中,调用方不注入) */
  getText(): string {
    return this.current;
  }

  private handle = (): void => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.readAndUpdate();
      this.onChange(this.current);
    }, DEBOUNCE_MS);
  };

  /**
   * 读取并更新选中。「塌陷保留」语义:
   * - 新的非空非敏感选区 → 覆盖 current;
   * - 塌陷(点击按钮/空白处)→ 保留 current(打开抽屉的动作不应丢掉用户引用);
   * - 敏感控件(input/textarea)内选区 → 显式清空 current(敏感优先)。
   */
  private readAndUpdate(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    if (sel.isCollapsed) return;
    const anchor = sel.anchorNode;
    const host =
      anchor?.nodeType === Node.TEXT_NODE
        ? anchor.parentElement
        : (anchor as HTMLElement | null);
    if (host?.closest('input, textarea')) {
      this.current = '';
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;
    this.current =
      text.length > MAX_SELECTION_CHARS
        ? text.slice(0, MAX_SELECTION_CHARS)
        : text;
  }
}
