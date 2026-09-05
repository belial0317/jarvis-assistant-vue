/**
 * PP4 manager 集成测试：订阅扇出 / captureLatest（title→insight）/
 * 会话更替重订 / stop 全拆除。
 * manager 为模块级单例，每个用例后 stop() 复位。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerceptionConfigVO } from '../api/perception';

vi.mock('../api/perception', () => ({
  listPerceptionConfigs: vi.fn(() =>
    Promise.resolve<PerceptionConfigVO[]>([]),
  ),
  fetchPerceptionManifest: vi.fn(() =>
    Promise.reject(new Error('manifest not available')),
  ),
  savePerceptionConfig: vi.fn(),
  deletePerceptionConfig: vi.fn(),
}));

import { pagePerception } from './manager';
import type { PageSnapshot } from './types';
import type { PerceptionStage } from './manager';

const MAIN_CONTENT = '__vben_main_content';

const TABLE_HTML = `
  <h2>用户管理</h2>
  <div class="ant-table"><div class="ant-table-container"><div class="ant-table-content">
    <table>
      <thead class="ant-table-thead"><tr><th>姓名</th></tr></thead>
      <tbody class="ant-table-tbody"><tr><td>张三</td></tr></tbody>
    </table>
  </div></div></div>
`;

function mountMain(html: string = TABLE_HTML) {
  const root = document.createElement('div');
  root.id = MAIN_CONTENT;
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function fakeRouteProvider(path: string, title?: string) {
  let listener: ((r: { path: string; title?: string }) => void) | null = null;
  return {
    getRoute: () => ({ path, title, name: '' }),
    watchRoute(cb: (r: { path: string; title?: string }) => void) {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    navigate(next: string, nextTitle?: string) {
      path = next;
      title = nextTitle ?? title;
      listener?.({ path, title });
    },
  };
}

describe('PagePerceptionManager PP4 API', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = mountMain();
  });

  afterEach(async () => {
    await pagePerception.stop();
    document.body.innerHTML = '';
  });

  it('captureLatest：产出快照，title 存在时带本地洞察', () => {
    pagePerception.start(fakeRouteProvider('/system/user', '用户管理'));

    const snapshot = pagePerception.captureLatest();

    expect(snapshot).not.toBeNull();
    expect(snapshot!.routePath).toBe('/system/user');
    expect(snapshot!.stale).toBe(false);
    expect(snapshot!.text).toContain('张三');
    expect(snapshot!.insight?.description).toContain('用户管理');
    expect(snapshot!.insight?.description).toContain('1 个表格');
  });

  it('subscribe：立即回放当前值，captured 事件驱动更新', async () => {
    // S6 起:start() 会主动建会话并首采(否则快照/埋点依赖路由变化才出现),
    // 先复位单例,保证本用例从干净状态开始
    await pagePerception.stop();
    const seen: Array<{ snapshot: PageSnapshot | null; stage: PerceptionStage }> = [];
    const off = pagePerception.subscribe((snapshot, stage) => {
      seen.push({ snapshot, stage });
    });

    try {
      pagePerception.start(fakeRouteProvider('/a', '页面A'));
      await pagePerception.captureLatest();
      // 首帧可能为 none(异步首采未完成)或 observing(已建会话),必须收敛到 ready
      const stages = seen.map((s) => s.stage);
      expect(['none', 'observing']).toContain(stages[0]);
      expect(stages).toContain('ready');
      const ready = seen.find((s) => s.stage === 'ready');
      expect(ready?.snapshot?.text).toContain('张三');
    } finally {
      off();
    }
  });

  it('路由切换：会话更替，快照换页，订阅持续有效', () => {
    const provider = fakeRouteProvider('/a', '页面A');
    pagePerception.start(provider);
    pagePerception.captureLatest();

    // 模拟路由跳转到新页面（DOM 替换为不同内容）
    root.innerHTML = '<p>日志页面内容</p>';
    provider.navigate('/log', '操作日志');

    const snapshot = pagePerception.captureLatest();
    expect(snapshot?.routePath).toBe('/log');
    expect(snapshot?.text).toContain('日志页面内容');
    expect(snapshot?.insight?.description).toContain('操作日志');
  });

  it('DOM 变异端到端：真实 MutationObserver → stale → 防抖重采集', async () => {
    pagePerception.start(fakeRouteProvider('/a', '页面A'));
    const first = pagePerception.captureLatest();
    expect(first?.text).toContain('张三');

    // 模拟翻页：表格内容变更
    root.querySelector('.ant-table-tbody')!.innerHTML =
      '<tr><td>李四</td></tr><tr><td>王五</td></tr>';

    // 防抖 500ms + 微任务后重采集完成（验收：变异后 ~1s 内快照更新）
    await vi.waitFor(
      () => {
        const snapshot = pagePerception.getSnapshot();
        expect(snapshot?.text).toContain('李四');
        expect(snapshot?.text).toContain('王五');
      },
      { timeout: 3000, interval: 100 },
    );
    expect(pagePerception.getState()).toBe('ready');
    expect(pagePerception.getSnapshot()?.mutationCount).toBe(0);
  });

  it('stop：全部拆除，状态复位 none', async () => {
    pagePerception.start(fakeRouteProvider('/a', '页面A'));
    pagePerception.captureLatest();
    expect(pagePerception.getState()).toBe('ready');

    await pagePerception.stop();

    expect(pagePerception.getState()).toBe('none');
    expect(pagePerception.getSnapshot()).toBeNull();
    // stop 后 captureLatest 走惰性重建（无 provider 时 routePath 为空串），可正常采集
    const again = pagePerception.captureLatest();
    expect(again).not.toBeNull();
    expect(again?.text).toContain('张三');
  });

  it('setDegraded：断连暂停采集，恢复自动重采', async () => {
    // S6 起单例含首采状态,先复位避免跨用例泄漏
    await pagePerception.stop();
    pagePerception.start(fakeRouteProvider('/a', '页面A'));
    pagePerception.captureLatest();
    expect(pagePerception.getState()).toBe('ready');

    pagePerception.setDegraded(true);
    expect(pagePerception.getState()).toBe('degraded');
    // degraded 下 captureLatest 返回 last-good（不重采、内容不变）
    const held = pagePerception.captureLatest();
    expect(held?.text).toContain('张三');

    pagePerception.setDegraded(false);
    await vi.waitFor(() =>
      expect(['ready', 'stale']).toContain(pagePerception.getState()),
    );
  });
});
