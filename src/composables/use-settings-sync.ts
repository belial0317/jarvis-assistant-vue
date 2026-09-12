/**
 * 宿主/门户参数同步到组件设置存储
 *
 * 由 AiAssistantConfig.syncParams 驱动（管理端配置为源）：
 * - 服务地址写入 localStorage 设置项，「设置」模块展示值与宿主下发值一致；
 * - API Key 仅写入内存凭据通道（setHostAiApiKey）：不落 localStorage、
 *   不进设置模块回显（用户裁决：默认不显示 sk Key）。值为空时跳过对应项。
 */
import { setAiBaseUrl, setHostAiApiKey } from '../api/client';
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
    setHostAiApiKey(apiKey);
    result.apiKeyApplied = true;
  }

  return result;
}
