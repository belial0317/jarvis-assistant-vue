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

/** 创建/更新感知配置 */
export function savePerceptionConfig(dto: PerceptionConfigSaveDTO) {
  return aiRequestClient.post<string>(PerceptionApi.SAVE, dto);
}

/** 删除感知配置 */
export function deletePerceptionConfig(id: string) {
  return aiRequestClient.delete(path(PerceptionApi.DELETE, { id }));
}
