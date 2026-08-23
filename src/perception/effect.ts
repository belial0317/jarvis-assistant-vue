/**
 * 统一回收协议（对标 cordis DisposableList + Fiber._unload 的逆序逐个吞错）。
 * MutationObserver / 路由监听 / 事件订阅等可撤销资源统一登记于此，
 * 会话销毁时逆序回收，单个失败不阻塞其余。
 */

export interface Disposable {
  (): void | Promise<void>;
}

export class EffectList {
  private seq = 0;
  private map = new Map<number, Disposable>();

  constructor(private onError?: (error: unknown, label: string) => void) {}

  get size(): number {
    return this.map.size;
  }

  /** 登记一个可撤销资源，返回撤销登记函数（不执行资源本身） */
  push(dispose: Disposable): () => void {
    const sn = ++this.seq;
    this.map.set(sn, dispose);
    return () => this.map.delete(sn);
  }

  /**
   * 逆序执行全部回收并清空列表。
   * 单个失败捕获后继续回收其余（对标 _unload 的逐个吞错）。
   */
  async clear(): Promise<void> {
    const disposables = [...this.map.values()].reverse();
    this.map.clear();
    for (const dispose of disposables) {
      try {
        await dispose();
      } catch (error) {
        this.onError?.(error, 'effect.dispose');
      }
    }
  }
}
