/**
 * 宿主/门户参数同步到组件设置存储
 *
 * 由 AiAssistantConfig.syncParams 驱动（管理端配置为源）：
 * 组件挂载/配置变更时把服务地址、API Key 写入 localStorage 设置项，
 * 使「设置」模块展示值与宿主下发值一致。值为空时跳过对应项。
 */
import { setAiApiKey, setAiBaseUrl } from '../api/client';
import type { AiAssistantConfig } from '../providers/config';

export interface SyncResult {
  baseURLApplied: boolean;
  apiKeyApplied: boolean;
}

export function applySyncParams(
  syncParams: NonNullable<AiAssistantConfig['syncParams']>,
): SyncResult {
  const result: SyncResult = { baseURLApplied: false, apiKeyApplied: false };

  const baseURL = syncParams.baseURL?.trim();
  if (baseURL) {
    setAiBaseUrl(baseURL);
    result.baseURLApplied = true;
  }

  const apiKey = syncParams.apiKey?.trim();
  if (apiKey) {
    setAiApiKey(apiKey);
    result.apiKeyApplied = true;
  }

  return result;
}
