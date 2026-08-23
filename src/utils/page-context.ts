/**
 * PP2 facade：保留旧公开签名，内部转发感知管线（perception/manager）。
 *
 * - capturePageContext / buildPageInsight：同步语义不变，输出经 golden 测试钉死；
 * - loadPerceptionConfigs：行为不变（config-store 缓存 + regex 预编译），
 *   完成后级联通知活跃 session（epoch 版本变化自动重采）。
 * 迁移说明见 docs/memory/tasks-2608-0819-01/PP2-collectors-strategies.md
 */

import { configStore } from '../perception/config-store';
import { pagePerception } from '../perception/manager';
import type { PageInsight } from '../perception/types';

export type { PageInsight };

export async function loadPerceptionConfigs(): Promise<void> {
  // PP3：版本化拉取（304 沿用 / diff 级联），changedIds 驱动活跃 session 重匹配
  const changedIds = await configStore.load();
  pagePerception.notifyConfigUpdate(changedIds);
}

export function capturePageContext(routePath?: string): string {
  return pagePerception.captureSync(routePath);
}

export function buildPageInsight(
  routePath?: string,
  routeTitle?: string,
): PageInsight | null {
  return pagePerception.insightNow(routePath, routeTitle);
}
