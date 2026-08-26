/**
 * PP2 策略层：提取范围解析（capturePageContext / buildPageInsight 的公共编排段，
 * 自 utils/page-context.ts 原样迁移，逻辑零改动）。
 */

import type { PerceptionConfigVO } from '../../api/perception';
import { isElementVisible } from './text';

export const ELEMENT_ID_MAIN_CONTENT = '__vben_main_content';

/**
 * 宿主配置的主内容区选择器（v1 P0-1 修复：此前 config.mainContentSelector
 * 从未被消费，根节点硬编码 vben id，非 vben 宿主感知恒空）。
 */
let configuredRootSelector: null | string = null;

export function setConfiguredRootSelector(selector: null | string | undefined): void {
  configuredRootSelector = selector?.trim() || null;
}

/** 根节点解析：宿主配置优先命中 → 回退 vben 内置 id（兼容既有 web-antd） */
export function getMainContentRoot(): HTMLElement | null {
  if (configuredRootSelector) {
    const el = document.querySelector<HTMLElement>(configuredRootSelector);
    if (el) return el;
  }
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
