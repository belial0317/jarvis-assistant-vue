/**
 * AI 助手 API：Skill 模块
 *
 * 对齐后端契约：
 *   GET    /skills            技能列表
 *   GET    /skills/enabled    已启用技能（斜杠命令匹配用）
 *   GET    /skills/{id}       技能详情
 *   POST   /skills            创建/更新
 *   DELETE /skills/{id}       删除
 *   PATCH  /skills/{id}/enabled 启用切换
 */
import type { Skill } from '../types';

import { aiRequestClient } from './client';
import { SkillApi, path } from './endpoints';

export type SkillVO = Skill;

export interface SkillQueryDTO {
  keyword?: string;
  category?: string;
  enabled?: boolean;
  pageNum?: number;
  pageSize?: number;
}

export interface SkillSaveDTO {
  id?: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  promptTemplate: string;
  parameters?: any[];
  allowedTools?: string[];
  triggerKeywords?: string[];
  enabled?: boolean;
}

export function listSkills(params?: SkillQueryDTO) {
  return aiRequestClient.get<SkillVO[]>(SkillApi.LIST, { params });
}

export function listEnabledSkills() {
  return aiRequestClient.get<SkillVO[]>(SkillApi.ENABLED);
}

export function getSkill(id: string) {
  return aiRequestClient.get<SkillVO>(path(SkillApi.DETAIL, { id }));
}

export function saveSkill(dto: SkillSaveDTO) {
  return aiRequestClient.post<string>(SkillApi.SAVE, dto);
}

export function deleteSkill(id: string) {
  return aiRequestClient.delete(path(SkillApi.DELETE, { id }));
}

export function toggleSkillEnabled(id: string, enabled: boolean) {
  return aiRequestClient.request<void>(
    path(SkillApi.TOGGLE_ENABLED, { id }),
    { method: 'PATCH', params: { enabled } },
  );
}

// ===================== Skill 分类字典 =====================

export interface SkillCategoryVO {
  id: string;
  /** 分类标识（对应 t_ai_skill.category） */
  categoryKey: string;
  /** 分类显示名称 */
  categoryName: string;
  /** 主题色（hex，用于 UI 渲染） */
  color?: string;
  /** 图标（iconify 名称） */
  icon?: string;
  sortOrder?: number;
  description?: string;
  /** 是否内置（内置不可删除） */
  isBuiltin?: boolean;
  enabled?: boolean;
  /** 该分类下的技能数量 */
  skillCount?: number;
}

export interface SkillCategorySaveDTO {
  id?: string;
  categoryKey: string;
  categoryName: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  description?: string;
  enabled?: boolean;
}

export function listSkillCategories() {
  return aiRequestClient.get<SkillCategoryVO[]>(SkillApi.CATEGORIES);
}

export function saveSkillCategory(dto: SkillCategorySaveDTO) {
  return aiRequestClient.post<string>(SkillApi.CATEGORIES, dto);
}

export function deleteSkillCategory(id: string) {
  return aiRequestClient.delete<number>(path(SkillApi.CATEGORY_DELETE, { id }));
}
