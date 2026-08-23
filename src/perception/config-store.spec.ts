/**
 * PP3 config-store 测试：304 沿用 / 200 diff 级联 / manifest 失败降级 legacy /
 * 全失败沿用 last-good。通过 mock api/perception 层驱动。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerceptionConfigVO } from '../api/perception';

const manifestMock = vi.fn();
const listMock = vi.fn();

vi.mock('../api/perception', () => ({
  fetchPerceptionManifest: (...args: unknown[]) => manifestMock(...args),
  listPerceptionConfigs: () => listMock(),
}));

import { configStore } from './config-store';

function vo(id: string, overrides: Partial<PerceptionConfigVO> = {}): PerceptionConfigVO {
  return {
    id,
    routePattern: `/${id}`,
    matchType: 'exact',
    selectors: [],
    strategy: 'auto',
    enabled: true,
    ...overrides,
  };
}

/** 重置单例内部状态（模块级单例跨用例复用） */
function resetStore() {
  // 通过 load 200 全量替换为空，version 复位由下一次 200 决定
  manifestMock.mockResolvedValue({
    notModified: false,
    etag: 'W/"0"',
    data: { version: 0, configs: [] },
  });
  return configStore.load();
}

describe('PerceptionConfigStore manifest/ETag', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetStore();
  });

  it('首次 200：应用配置、记录 ETag、返回全部 id 为变更', async () => {
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"1000"',
      data: { version: 1000, configs: [vo('a'), vo('b')] },
    });

    const changed = await configStore.load();

    expect(changed).toEqual(['a', 'b']);
    expect(configStore.version).toBe(1000);
    expect(configStore.findConfig('/a')?.id).toBe('a');
    // 第二次请求透传上次 ETag
    manifestMock.mockResolvedValueOnce({ notModified: true, etag: 'W/"1000"' });
    await configStore.load();
    expect(manifestMock).toHaveBeenLastCalledWith('W/"1000"');
  });

  it('304：零解析沿用本地配置，changedIds 为空', async () => {
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"1000"',
      data: { version: 1000, configs: [vo('a')] },
    });
    await configStore.load();

    manifestMock.mockResolvedValueOnce({ notModified: true });
    const changed = await configStore.load();

    expect(changed).toEqual([]);
    expect(configStore.version).toBe(1000);
    expect(configStore.findConfig('/a')?.id).toBe('a');
  });

  it('200 diff：仅变化的 id 进入 changedIds（改/删/增）', async () => {
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"1000"',
      data: { version: 1000, configs: [vo('a'), vo('b'), vo('c')] },
    });
    await configStore.load();

    // b 改字段、c 删除、d 新增
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"2000"',
      data: {
        version: 2000,
        configs: [
          vo('a'),
          vo('b', { strategy: 'text_only' }),
          vo('d'),
        ],
      },
    });
    const changed = await configStore.load();

    expect(changed.sort()).toEqual(['b', 'c', 'd'].sort());
    expect(configStore.version).toBe(2000);
    expect(configStore.findConfig('/c')).toBeNull();
  });

  it('字段未变但版本推进：changedIds 为空（仅版本级联）', async () => {
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"1000"',
      data: { version: 1000, configs: [vo('a')] },
    });
    await configStore.load();

    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"2000"',
      data: { version: 2000, configs: [vo('a')] },
    });
    const changed = await configStore.load();

    expect(changed).toEqual([]);
    expect(configStore.version).toBe(2000);
  });

  it('manifest 失败（旧后端 404）：降级 legacy 列表端点', async () => {
    manifestMock.mockRejectedValueOnce(new Error('HTTP 404'));
    listMock.mockResolvedValueOnce([vo('legacy')]);

    const changed = await configStore.load();

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(changed).toEqual([]);
    expect(configStore.findConfig('/legacy')?.id).toBe('legacy');
  });

  it('manifest 与 legacy 全失败：沿用 last-good 配置', async () => {
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"1000"',
      data: { version: 1000, configs: [vo('a')] },
    });
    await configStore.load();

    manifestMock.mockRejectedValueOnce(new Error('HTTP 404'));
    listMock.mockRejectedValueOnce(new Error('network down'));
    const changed = await configStore.load();

    expect(changed).toEqual([]);
    expect(configStore.findConfig('/a')?.id).toBe('a');
  });

  it('regex 缓存按 id 失效：删除配置后不残留', async () => {
    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"1000"',
      data: {
        version: 1000,
        configs: [vo('re1', { matchType: 'regex', routePattern: '^/x/.*$' })],
      },
    });
    await configStore.load();
    expect(configStore.findConfig('/x/1')?.id).toBe('re1');

    manifestMock.mockResolvedValueOnce({
      notModified: false,
      etag: 'W/"2000"',
      data: { version: 2000, configs: [] },
    });
    await configStore.load();
    expect(configStore.findConfig('/x/1')).toBeNull();
  });
});
