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

/** 宿主 syncParams 已下发的服务地址（用于用户级设置回填时的优先级判定：宿主下发优先） */
let syncedBaseUrl: string | null = null;

/** 最近一次 syncParams 下发的服务地址；未下发过返回 null */
export function getSyncedBaseUrl(): string | null {
  return syncedBaseUrl;
}

export function applySyncParams(
  syncParams: NonNullable<AiAssistantConfig['syncParams']>,
): SyncResult {
  const result: SyncResult = { baseURLApplied: false, apiKeyApplied: false };

  const baseURL = syncParams.baseURL?.trim();
  if (baseURL) {
    setAiBaseUrl(baseURL);
    syncedBaseUrl = baseURL;
    result.baseURLApplied = true;
  }

  const apiKey = syncParams.apiKey?.trim();
  if (apiKey) {
    setHostAiApiKey(apiKey);
    result.apiKeyApplied = true;
  }

  return result;
}
