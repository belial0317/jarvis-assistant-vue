/**
 * PP2 可见性采集器：页签可见性 + 抽屉开关 双门控。
 * 任一不可见 → 暂停 DOM 观察（省 CPU）；恢复可见 → 重连并立即重采集一次。
 */

export class VisibilityController {
  private pageVisible = true;
  private active = true;
  private started = false;

  constructor(private onChange: (observing: boolean) => void) {}

  /** 页签与抽屉均可见时才应观察 */
  get observing(): boolean {
    return this.pageVisible && this.active;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.pageVisible = !document.hidden;
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  stop(): void {
    if (!this.started) return;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.started = false;
  }

  /** 抽屉开关联动（component.vue watch(open) 调用） */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.notify();
  }

  private handleVisibility = () => {
    const visible = !document.hidden;
    if (this.pageVisible === visible) return;
    this.pageVisible = visible;
    this.notify();
  };

  private notify(): void {
    this.onChange(this.observing);
  }
}
