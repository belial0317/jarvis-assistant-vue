/**
 * 图标工具 - 内建实现，替代 @vben/icons 的 createIconifyIcon
 *
 * 直接使用 @iconify/vue 的 Icon 组件包装，
 * API 与 @vben/icons 完全兼容。
 */

import type { Component } from 'vue';

import { defineComponent, h } from 'vue';

import { addCollection, Icon as IconifyIcon } from '@iconify/vue';

import { lucideSubset } from './lucide-subset';

// T15-U7：注册 lucide 离线子集（内网/离线环境可用）；
// 子集未收录的图标仍由 Iconify API 在线兜底
addCollection(lucideSubset);

/**
 * createIconifyIcon - 把 iconify 名称（如 'lucide:plus'）包装为 Vue 组件。
 *
 * @example
 * const PlusIcon = createIconifyIcon('lucide:plus');
 * <PlusIcon class="h-4 w-4" />
 */
export function createIconifyIcon(icon: string): Component {
  return defineComponent({
    name: `AiAssistantIcon-${icon.replace(/[-:]/g, '_')}`,
    inheritAttrs: false,
    setup(_props, { attrs }) {
      return () =>
        h(IconifyIcon, {
          icon,
          ...attrs,
        });
    },
  });
}
