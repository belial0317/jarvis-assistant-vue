/**
 * PP3 配置仓：感知配置的版本化拉取（manifest + ETag/304 + 按 id diff）。
 *
 * - 首选 GET /perception/configs/manifest：命中 304 沿用本地缓存（零解析）；
 * - 200 时按 id deepEqual diff，产出 changedIds 供 kernel 级联重匹配；
 * - 拉取失败 / 旧后端（404）→ 降级 listPerceptionConfigs / 沿用旧配置（last-good）；
 * - regex 预编译缓存随配置更新按 id 失效。
 */

import type { PerceptionConfigVO } from '../api/perception';
import { fetchPerceptionManifest, listPerceptionConfigs } from '../api/perception';
import type { SnapshotEpoch } from './types';

/** 配置字段级相等（浅比较足够：字段均为原始值/字符串数组） */
function configEquals(a: PerceptionConfigVO, b: PerceptionConfigVO): boolean {
  return (
    a.routePattern === b.routePattern &&
    a.matchType === b.matchType &&
    a.strategy === b.strategy &&
    a.description === b.description &&
    a.enabled === b.enabled &&
    a.selectors.length === b.selectors.length &&
    a.selectors.every((s, i) => s === b.selectors[i])
  );
}

class PerceptionConfigStore {
  private configs: PerceptionConfigVO[] = [];

  /** 预编译的 regex 规则缓存（key: config id -> RegExp | null） */
  private compiledRegexCache = new Map<string, RegExp | null>();

  /** 配置库版本（manifest.version 或本地递增计数） */
  _version = 0;

  /** 最近一次 manifest 成功响应的 ETag（If-None-Match 透传） */
  private etag: string | undefined;

  get version(): number {
    return this._version;
  }

  /**
   * 版本化拉取：304 沿用 / 200 diff 应用 / 异常降级（manifest → legacy → last-good）。
   * 返回本次变化的配置 id 列表（304/失败为空数组）。
   */
  async load(): Promise<string[]> {
    let manifest;
    try {
      manifest = await fetchPerceptionManifest(this.etag);
    } catch {
      // manifest 端点不可用（旧后端 404 / 网络错误）：降级 legacy 拉取
      await this.loadLegacy();
      return [];
    }
    if (manifest.notModified) {
      // 304：零解析，沿用本地配置
      return [];
    }
    if (manifest.data) {
      this.etag = manifest.etag;
      const changedIds = this.diffChangedIds(manifest.data.configs ?? []);
      this.applyConfigs(manifest.data.configs ?? [], manifest.data.version);
      return changedIds;
    }
    return [];
  }

  /** 按 id 对比新旧配置，找出发生增删改的 id 集 */
  private diffChangedIds(next: PerceptionConfigVO[]): string[] {
    const oldMap = new Map(this.configs.map((c) => [c.id, c]));
    const changed: string[] = [];
    for (const config of next) {
      const old = oldMap.get(config.id);
      if (!old || !configEquals(old, config)) changed.push(config.id);
    }
    const nextIds = new Set(next.map((c) => c.id));
    for (const old of this.configs) {
      if (!nextIds.has(old.id)) changed.push(old.id);
    }
    return changed;
  }

  /** 与旧 load 等价的降级路径（无 manifest 能力时使用，version 递增保证级联） */
  private async loadLegacy(): Promise<void> {
    try {
      const configs = await listPerceptionConfigs();
      this.applyConfigs(configs, this._version + 1);
    } catch {
      // 拉取失败：沿用旧配置（last-good）
    }
  }

  /** 应用全量配置并失效对应 regex 缓存（delete 的 id 也一并清掉） */
  private applyConfigs(configs: PerceptionConfigVO[], version: number): void {
    for (const id of this.compiledRegexCache.keys()) {
      if (!configs.some((c) => c.id === id)) this.compiledRegexCache.delete(id);
    }
    this.configs = configs;
    for (const c of configs) {
      if (c.matchType === 'regex') {
        try {
          this.compiledRegexCache.set(c.id, new RegExp(c.routePattern));
        } catch {
          this.compiledRegexCache.set(c.id, null);
        }
      }
    }
    this._version = version;
  }

  /** 路由匹配（原 findConfig 逻辑，行为不变） */
  findConfig(routePath: string): PerceptionConfigVO | null {
    for (const c of this.configs) {
      if (!c.enabled) continue;
      switch (c.matchType) {
        case 'exact': {
          if (routePath === c.routePattern) return c;
          break;
        }
        case 'prefix': {
          if (routePath.startsWith(c.routePattern)) return c;
          break;
        }
        case 'regex': {
          const compiled = this.compiledRegexCache.get(c.id);
          if (compiled === null) continue; // 无效 regex，跳过
          if (compiled === undefined) {
            // 缓存未命中（理论上不会发生，因为 load 已预编译）
            try {
              const re = new RegExp(c.routePattern);
              this.compiledRegexCache.set(c.id, re);
              if (re.test(routePath)) return c;
            } catch {
              this.compiledRegexCache.set(c.id, null);
            }
          } else if (compiled.test(routePath)) {
            return c;
          }
          break;
        }
      }
    }
    return null;
  }

  /** 解析内容指纹（kernel deps.resolveEpoch 的实现） */
  resolveEpoch(routePath: string): SnapshotEpoch {
    const config = routePath ? this.findConfig(routePath) : null;
    return { configId: config?.id ?? '', configVersion: this._version };
  }
}

/** 模块级单例：与旧 page-context 的模块级缓存语义一致 */
export const configStore = new PerceptionConfigStore();
