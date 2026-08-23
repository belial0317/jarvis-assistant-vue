import type { PerceptionEvent, PerceptionEventName, PerceptionListener } from './types';

/**
 * 会话级事件总线（对标 cordis EventsService 的最小子集）。
 * 事件按 session 实例分发，不串台；监听器异常不阻断其他监听器。
 */
export class PerceptionEventBus {
  private listeners = new Map<PerceptionEventName, Set<PerceptionListener>>();

  on(name: PerceptionEventName, listener: PerceptionListener): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(event: PerceptionEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    // 拷贝后派发，防止监听器内取消订阅影响本轮遍历
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        // 错误隔离：单个监听器异常不阻断派发
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
