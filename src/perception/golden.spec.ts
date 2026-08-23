/**
 * PP2 Golden 测试：钉死 utils/page-context.ts 公开导出的输出。
 *
 * 流程约束：本文件先于策略迁移编写，用【旧实现】生成 __snapshots__ 基线；
 * 迁移后重跑必须全绿，以此证明「chat 模块依赖的 facade 输出逐字节一致」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerceptionConfigVO } from '../api/perception';

// mock 掉网络层：新旧实现的配置读取都走 listPerceptionConfigs，注入确定性配置
// （manifest 端点按旧后端场景 mock 为不可用 → config-store 自动降级 legacy 路径）
vi.mock('../api/perception', () => ({
  listPerceptionConfigs: vi.fn(() =>
    Promise.resolve<GOLDEN_CONFIGS_TYPE>([
      {
        id: 'cfg-table',
        routePattern: '/system/user',
        matchType: 'exact',
        selectors: ['.ant-table'],
        strategy: 'auto',
        enabled: true,
      },
      {
        id: 'cfg-textonly',
        routePattern: '/system/log',
        matchType: 'prefix',
        selectors: [],
        strategy: 'text_only',
        enabled: true,
      },
      {
        id: 'cfg-full',
        routePattern: '^/report/.*$',
        matchType: 'regex',
        selectors: ['#report-body'],
        strategy: 'full',
        enabled: true,
      },
      {
        id: 'cfg-disabled',
        routePattern: '/system/user',
        matchType: 'exact',
        selectors: [],
        strategy: 'full',
        enabled: false,
      },
    ]),
  ),
  fetchPerceptionManifest: vi.fn(() =>
    Promise.reject(new Error('manifest not available (legacy backend)')),
  ),
  savePerceptionConfig: vi.fn(),
  deletePerceptionConfig: vi.fn(),
}));

type GOLDEN_CONFIGS_TYPE = PerceptionConfigVO[];

import {
  buildPageInsight,
  capturePageContext,
  loadPerceptionConfigs,
} from '../utils/page-context';
import { pagePerception } from './manager';

/**
 * manager 为模块级单例：每个用例结束后拆除观察器/会话，
 * 防止 MutationObserver 跨用例触发异步重采集造成串扰。
 */
afterEach(async () => {
  await pagePerception.stop();
});

const TABLE_PAGE = `
<div id="__vben_main_content">
  <h2>用户管理</h2>
  <p>共 3 条记录，数据仅供参考。</p>
  <div class="ant-table">
    <div class="ant-table-container">
      <div class="ant-table-content">
        <table>
          <colgroup></colgroup>
          <thead class="ant-table-thead">
            <tr><th>姓名</th><th>角色</th><th>状态</th></tr>
          </thead>
          <tbody class="ant-table-tbody">
            <tr><td>张三</td><td>管理员</td><td>启用</td></tr>
            <tr><td>李四</td><td>运维</td><td>停用</td></tr>
            <tr style="display:none"><td>王五</td><td>访客</td><td>启用</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>console.log('noise')</script>
  <style>.noise { color: red }</style>
  <div class="ant-modal">弹窗噪声不应出现</div>
  <span>页脚补充说明</span>
</div>
`;

const TEXT_PAGE = `
<div id="__vben_main_content">
  <h3>操作日志</h3>
  <div>
    <p>第一条：用户登录成功。${'细节说明文字。'.repeat(40)}</p>
    <p>第二条：配置已更新。${'更多细节内容。'.repeat(40)}</p>
  </div>
</div>
`;

const LONG_TEXT_PAGE = `
<div id="__vben_main_content">
  <p>${'超长文本行，用于触发压缩与摘要降级路径。'.repeat(120)}</p>
  <p>${'第二段超长文本，确保 combined 超过 3500 字符阈值。'.repeat(120)}</p>
</div>
`;

const EMPTY_PAGE = `<div id="__vben_main_content"></div>`;

const REPORT_PAGE = `
<div id="__vben_main_content">
  <div id="report-body">
    <p>报表正文 ${'数据'.repeat(200)}</p>
  </div>
  <p>报表外的内容不应进入 full 策略输出</p>
</div>
`;

function mount(html: string) {
  document.body.innerHTML = html;
}

describe('golden: capturePageContext（旧实现基线，迁移后必须逐字节一致）', () => {
  beforeEach(async () => {
    mount(TABLE_PAGE);
    await loadPerceptionConfigs();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('表格页 + exact 配置命中 .ant-table 选择器（auto 策略）', () => {
    expect(capturePageContext('/system/user')).toMatchSnapshot();
  });

  it('无匹配配置时全内容区 auto 提取（噪声过滤 + 隐藏行排除）', () => {
    expect(capturePageContext('/unknown/route')).toMatchSnapshot();
  });

  it('不传 routePath：不查配置，全内容区提取', () => {
    expect(capturePageContext()).toMatchSnapshot();
  });

  it('prefix 配置 + text_only 策略（表格被跳过）', () => {
    mount(TEXT_PAGE);
    expect(capturePageContext('/system/log/detail')).toMatchSnapshot();
  });

  it('超长文本触发自适应压缩/摘要降级', () => {
    mount(LONG_TEXT_PAGE);
    expect(capturePageContext()).toMatchSnapshot();
  });

  it('regex 配置 + full 策略：不压缩直出（选择器圈定）', () => {
    mount(REPORT_PAGE);
    expect(capturePageContext('/report/2026/q2')).toMatchSnapshot();
  });

  it('disabled 配置不参与匹配', () => {
    // cfg-disabled 同为 /system/user 但 enabled=false，应命中的仍是 cfg-table
    expect(capturePageContext('/system/user')).toMatchSnapshot();
  });

  it('空页面返回空字符串', () => {
    mount(EMPTY_PAGE);
    expect(capturePageContext('/anywhere')).toBe('');
  });

  it('主内容区不存在时返回空字符串', () => {
    mount('<div>no main content</div>');
    expect(capturePageContext('/anywhere')).toBe('');
  });
});

describe('golden: buildPageInsight（旧实现基线）', () => {
  beforeEach(async () => {
    await loadPerceptionConfigs();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('表格页洞察：1 表格 2 可见行', () => {
    mount(TABLE_PAGE);
    expect(
      buildPageInsight('/system/user', '用户管理'),
    ).toMatchSnapshot();
  });

  it('纯文本页洞察：约 N 字符', () => {
    mount(TEXT_PAGE);
    expect(buildPageInsight('/system/log', '操作日志')).toMatchSnapshot();
  });

  it('空页面洞察：暂无可识别内容', () => {
    mount(EMPTY_PAGE);
    expect(buildPageInsight('/x', undefined)).toMatchSnapshot();
  });

  it('无标题时默认「当前页面」', () => {
    mount(TABLE_PAGE);
    expect(buildPageInsight('/system/user')).toMatchSnapshot();
  });
});
