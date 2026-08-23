/**
 * PP2 路由采集器：路由进入/离开 → session 生命周期。
 * 消费宿主注入的 RouteContextProvider（框架无关），path 去重后回调。
 */

import type { RouteContextProvider } from '../../providers/route-provider';

export interface RouteWatchHandle {
  stop(): void;
}

/**
 * 监听路由变化：path 变化时回调（首次挂载不触发，由调用方按需首采）。
 * 返回停止函数（随组件卸载调用）。
 */
export function watchRoutes(
  provider: RouteContextProvider,
  onRouteChange: (path: string) => void,
): RouteWatchHandle {
  let lastPath = provider.getRoute().path;
  const stop = provider.watchRoute((route) => {
    if (route.path === lastPath) return;
    lastPath = route.path;
    onRouteChange(route.path);
  });
  return { stop };
}
