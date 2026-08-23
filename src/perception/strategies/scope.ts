/**
 * PP2 策略层：提取范围解析（capturePageContext / buildPageInsight 的公共编排段，
 * 自 utils/page-context.ts 原样迁移，逻辑零改动）。
 */

import type { PerceptionConfigVO } from '../../api/perception';
import { isElementVisible } from './text';

export const ELEMENT_ID_MAIN_CONTENT = '__vben_main_content';

export function getMainContentRoot(): HTMLElement | null {
  return document.getElementById(ELEMENT_ID_MAIN_CONTENT);
}

/**
 * 按配置 selectors 圈定提取范围；无配置 / 无命中时回退整个主内容区。
 */
export function resolveScope(
  root: HTMLElement,
  config: PerceptionConfigVO | null,
): HTMLElement[] {
  const scope: HTMLElement[] = [];
  if (config && config.selectors.length > 0) {
    for (const sel of config.selectors) {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (isElementVisible(el) && !scope.includes(el)) scope.push(el);
      });
    }
  }
  if (scope.length === 0) scope.push(root);
  return scope;
}
