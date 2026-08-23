import { aiRequestClient } from './client';
import { PerceptionApi, path } from './endpoints';

/** 感知配置 VO */
export interface PerceptionConfigVO {
  id: string;
  routePattern: string;
  matchType: 'exact' | 'prefix' | 'regex';
  selectors: string[];
  strategy: 'auto' | 'full' | 'table_only' | 'text_only';
  description?: string;
  enabled: boolean;
}

/** PP3 版本化清单 VO（304 时 configs 为空，沿用本地缓存） */
export interface PerceptionManifestVO {
  /** 配置库版本（毫秒时间戳） */
  version: number;
  /** 全量启用配置（304 响应不携带） */
  configs: PerceptionConfigVO[];
}

/** 感知配置保存 DTO */
export interface PerceptionConfigSaveDTO {
  id?: string;
  routePattern: string;
  matchType?: 'exact' | 'prefix' | 'regex';
  selectors: string[];
  strategy?: 'auto' | 'full' | 'table_only' | 'text_only';
  description?: string;
  enabled?: boolean;
}

/** 查询全部启用的感知配置 */
export function listPerceptionConfigs() {
  return aiRequestClient.get<PerceptionConfigVO[]>(PerceptionApi.LIST);
}

/**
 * PP3 版本化清单拉取：携带上次 ETag，命中时返回 notModified（零解析）。
 * 旧后端（无 manifest 端点）会 404，由调用方降级到 listPerceptionConfigs。
 */
export function fetchPerceptionManifest(etag?: string) {
  return aiRequestClient.getWithEtag<PerceptionManifestVO>(
    PerceptionApi.MANIFEST,
    etag,
  );
}

/** 创建/更新感知配置 */
export function savePerceptionConfig(dto: PerceptionConfigSaveDTO) {
  return aiRequestClient.post<string>(PerceptionApi.SAVE, dto);
}

/** 删除感知配置 */
export function deletePerceptionConfig(id: string) {
  return aiRequestClient.delete(path(PerceptionApi.DELETE, { id }));
}
