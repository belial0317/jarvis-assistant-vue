/**
 * AI 助手 API：供应商模块
 *
 * 对齐后端契约：
 *   GET    /providers                 供应商列表
 *   GET    /providers/{id}            供应商详情（含模型）
 *   POST   /providers                 创建/更新
 *   DELETE /providers/{id}            删除
 *   PATCH  /providers/{id}/enabled    启用切换
 *   POST   /providers/{id}/test       测试连通性
 *   GET    /providers/{id}/models     模型列表
 */
import type { Provider, ProviderModel } from '../types';

import { aiRequestClient } from './client';
import { ProviderApi, path } from './endpoints';

/** 后端 ProviderVO（对齐前端 Provider 类型，但 id 为字符串） */
export type ProviderVO = Provider;

/** 后端 ProviderModelVO（pricing 为 JSON 字符串） */
export interface ProviderModelVO extends Omit<ProviderModel, 'pricing'> {
  /** 后端以原始 JSON 字符串输出 */
  pricing: string;
}

export interface ProviderQueryDTO {
  keyword?: string;
  type?: string;
  status?: string;
  enabled?: boolean;
  pageNum?: number;
  pageSize?: number;
}

export interface ProviderSaveDTO {
  id?: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKey?: string;
  status?: string;
  enabled?: boolean;
  isBuiltin?: boolean;
}

/** 供应商列表 */
export function listProviders(params?: ProviderQueryDTO) {
  return aiRequestClient.get<ProviderVO[]>(ProviderApi.LIST, { params });
}

/** 供应商详情（含模型列表） */
export function getProvider(id: string) {
  return aiRequestClient.get<ProviderVO>(path(ProviderApi.DETAIL, { id }));
}

/** 创建/更新供应商 */
export function saveProvider(dto: ProviderSaveDTO) {
  return aiRequestClient.post<string>(ProviderApi.SAVE, dto);
}

/** 删除供应商 */
export function deleteProvider(id: string) {
  return aiRequestClient.delete(path(ProviderApi.DELETE, { id }));
}

/** 启用切换 */
export function toggleProviderEnabled(id: string, enabled: boolean) {
  return aiRequestClient.request<void>(
    path(ProviderApi.TOGGLE_ENABLED, { id }),
    { method: 'PATCH', params: { enabled } },
  );
}

/** 测试连通性 */
export function testProviderConnection(id: string) {
  return aiRequestClient.post<ProviderVO>(path(ProviderApi.TEST, { id }));
}

/** 模型列表 */
export function listProviderModels(id: string) {
  return aiRequestClient.get<ProviderModelVO[]>(
    path(ProviderApi.MODELS, { id }),
  );
}
