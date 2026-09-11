/**
 * T21：工具结果渲染器注册表（对标 AgentScope tool-renderers）。
 *
 * 宿主/内置均可为指定工具名注册自定义渲染组件；未注册的工具走默认渲染。
 * key 支持精确工具名（如 local_nl2sql / mcp_github_create_pr）。
 */
import type { Component } from 'vue';

const renderers = new Map<string, Component>();

/** 注册/覆盖一个工具结果渲染器 */
export function registerToolRenderer(toolName: string, component: Component): void {
  renderers.set(toolName, component);
}

/** 批量注册 */
export function registerToolRenderers(map: Record<string, Component>): void {
  for (const [k, v] of Object.entries(map)) {
    renderers.set(k, v);
  }
}

/** 查询渲染器（未注册返回 undefined） */
export function getToolRenderer(toolName: string): Component | undefined {
  return renderers.get(toolName);
}

/** 已注册工具名清单（调试用） */
export function listToolRenderers(): string[] {
  return [...renderers.keys()];
}
