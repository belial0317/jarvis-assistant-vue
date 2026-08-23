/**
 * PP2 DOM 变异采集器：MutationObserver 封装。
 * - 只观察传入的目标节点（命中配置 selectors 的容器或主内容区）；
 * - 每次回调仅通知一次（风暴防护：不逐条处理记录，单 flush 上限阈值丢弃明细）；
 * - pause/detach 语义：页签隐藏或抽屉关闭时断开观察省 CPU。
 */

const MAX_RECORDS_PER_FLUSH = 1000;

export class DomCollector {
  private observer: MutationObserver | null = null;
  private targets: Element[] = [];

  constructor(private onMutation: () => void) {}

  get observing(): boolean {
    return this.observer !== null;
  }

  /** 观察一组目标；重复调用会先解除旧观察 */
  attach(targets: Element[]): void {
    this.detach();
    if (targets.length === 0) return;
    this.targets = [...targets];
    const observer = new MutationObserver((records) => {
      // 风暴防护：超出上限的记录明细直接丢弃，仅保留「发生过变异」的信号
      if (records.length > MAX_RECORDS_PER_FLUSH) {
        console.debug(
          `[dom-collector] mutation flush truncated: ${records.length} records`,
        );
      }
      this.onMutation();
    });
    for (const target of targets) {
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    this.observer = observer;
  }

  /** 解除观察（可重新 attach） */
  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.targets = [];
  }

  /** 当前观察目标（供路由切换时复用判定） */
  get currentTargets(): Element[] {
    return [...this.targets];
  }
}
