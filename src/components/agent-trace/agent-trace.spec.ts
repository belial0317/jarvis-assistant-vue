/**
 * T0 可行性验证测试：布局与判定纯函数 + 组件挂载冒烟。
 * 夹具覆盖契约要求的场景：主 Agent、Skill 匹配未应用、知识库、
 * 同名并行工具、失败工具、审批拒绝、子 Agent 后台、无返回任务。
 */
import { describe, expect, it, beforeAll } from 'vitest';
import {
  groupByCallKey,
  hasObservedReturn,
  layoutTrace,
  orderParticipants,
  statusText,
  type TraceEdgeLike,
  type TraceSpanLike,
} from './traceLayout';

const span = (over: Partial<TraceSpanLike>): TraceSpanLike => ({
  spanId: 'x',
  parentSpanId: null,
  sequenceNo: 1,
  kind: 'tool_call',
  label: 'tool',
  fromParticipantId: 'agent:1',
  toParticipantId: 'tool:query_db',
  executionStatus: 'success',
  resultKind: 'ok',
  durationMs: 100,
  callKey: null,
  childTraceId: null,
  ...over,
});

const edges: TraceEdgeLike[] = [];

describe('traceLayout.hasObservedReturn（D07：仅事实返回才画返回箭头）', () => {
  it('denied / not_observed / background 不画返回边', () => {
    expect(hasObservedReturn(span({ executionStatus: 'denied', resultKind: null }), edges)).toBe(false);
    expect(hasObservedReturn(span({ executionStatus: 'not_observed', resultKind: null }), edges)).toBe(false);
    expect(hasObservedReturn(span({ executionStatus: 'background', resultKind: null }), edges)).toBe(false);
  });

  it('success 与 error 画返回边（error 返回了错误结果也是事实返回）', () => {
    expect(hasObservedReturn(span({ executionStatus: 'success' }), edges)).toBe(true);
    expect(hasObservedReturn(span({ executionStatus: 'error', resultKind: 'system_error' }), edges)).toBe(true);
  });

  it('边列表显式声明 return 且指向该 span 时成立（拒绝等场景后端不声明）', () => {
    const s = span({ spanId: 's1', executionStatus: 'success' });
    expect(hasObservedReturn(s, [{ id: 'r1', fromSpanId: 's1', toSpanId: 's1', direction: 'return', resultSpanId: 's1' }])).toBe(true);
  });
});

describe('traceLayout.groupByCallKey（R07：同名并行调用不串线）', () => {
  it('同 callKey 归组，不同 callKey 分开，无 callKey 不入组', () => {
    const groups = groupByCallKey([
      span({ spanId: 'a1', callKey: 'ck-a' }),
      span({ spanId: 'a2', callKey: 'ck-b' }),
      span({ spanId: 'a3', callKey: 'ck-a' }),
      span({ spanId: 'a4', callKey: null }),
    ]);
    expect(groups.get('ck-a')!.map((s) => s.spanId)).toEqual(['a1', 'a3']);
    expect(groups.get('ck-b')!.map((s) => s.spanId)).toEqual(['a2']);
    expect(groups.size).toBe(2);
  });
});

describe('traceLayout.layoutTrace（时序布局）', () => {
  const participants = [
    { id: 'user', type: 'user', label: '用户' },
    { id: 'chat', type: 'service', label: 'ChatService' },
    { id: 'agent:1', type: 'agent', label: 'Agent' },
  ];

  it('参与者按声明顺序排泳道，节点落在被调用方列', () => {
    const { nodes, participants: ordered } = layoutTrace(
      [
        span({ spanId: 's1', sequenceNo: 1, fromParticipantId: 'user', toParticipantId: 'chat' }),
        span({ spanId: 's2', sequenceNo: 2, fromParticipantId: 'chat', toParticipantId: 'agent:1' }),
      ],
      [],
      participants,
    );
    expect(ordered.map((p) => p.id)).toEqual(['user', 'chat', 'agent:1']);
    expect(nodes[0].x).toBeLessThan(nodes[1].x);
    expect(nodes[1].y).toBeGreaterThan(nodes[0].y);
  });

  it('有父的 span 生成 request 边；return 边只对观测到返回的 span 生成', () => {
    const { layoutEdges } = layoutTrace(
      [
        span({ spanId: 's-root', sequenceNo: 1, parentSpanId: null, executionStatus: 'success', resultKind: 'ok' }),
        span({ spanId: 's-ok', sequenceNo: 2, parentSpanId: 's-root', executionStatus: 'success', resultKind: 'ok' }),
        span({ spanId: 's-denied', sequenceNo: 3, parentSpanId: 's-root', executionStatus: 'denied', resultKind: null }),
      ],
      [],
      participants,
    );
    expect(layoutEdges.filter((e) => e.direction === 'request')).toHaveLength(2);
    expect(layoutEdges.filter((e) => e.direction === 'request' && e.source === 's-root')).toHaveLength(2);
    const retForOk = layoutEdges.filter((e) => e.direction === 'return' && e.id === 'ret-s-ok');
    const retForDenied = layoutEdges.filter((e) => e.direction === 'return' && e.id === 'ret-s-denied');
    expect(retForOk).toHaveLength(1);
    expect(retForDenied).toHaveLength(0);
  });
});

describe('statusText（executionStatus 与 resultKind 分离表达）', () => {
  it('denied 不带业务结果后缀；success+business_error 显示业务失败', () => {
    expect(statusText('denied', null)).toBe('denied');
    expect(statusText('success', 'business_error')).toBe('success · 业务失败');
    expect(statusText('success', 'ok')).toBe('success · 业务成功');
    expect(statusText('not_observed', null)).toBe('not_observed');
  });
});

describe('orderParticipants（泳道排序）', () => {
  it('去重且按声明优先，再按首次出现', () => {
    const ordered = orderParticipants(
      [span({ fromParticipantId: 'chat', toParticipantId: 'agent:1' })],
      [{ id: 'user', type: 'user', label: '用户' }],
    );
    expect(ordered.map((p) => p.id)).toEqual(['user', 'chat', 'agent:1']);
  });
});

describe('AgentTraceDemo 组件挂载冒烟（jsdom）', () => {
  let mounted: { unmount: () => void; el: HTMLElement } | null = null;

  beforeAll(() => {
    // VueFlow 依赖 ResizeObserver，jsdom 未实现
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as Record<string, unknown>).ResizeObserver = RO;
    // VueFlow fitView/getBox 依赖 SVG getBBox，jsdom 未实现
    (globalThis.SVGElement.prototype as Record<string, unknown>).getBBox = () => ({ x: 0, y: 0, width: 100, height: 40 });
  });

  it('渲染全部 mock 节点与 request/return 边，详情面板显示引导文案', async () => {
    const { createApp, h } = await import('vue');
    const mod = await import('./AgentTraceDemo.vue');
    const el = document.createElement('div');
    el.style.width = '1200px';
    el.style.height = '600px';
    document.body.appendChild(el);
    const app = createApp({ render: () => h(mod.default) });
    app.mount(el);
    mounted = { unmount: () => app.unmount(), el };
    await new Promise((r) => setTimeout(r, 50));
    const nodes = el.querySelectorAll('.vue-flow__node');
    expect(nodes.length).toBeGreaterThanOrEqual(14);
    expect(el.textContent).toContain('智能体路径');
    expect(el.textContent).toContain('integrity partial');
  }, 15000);

  it('渲染层：request/return 边数量与事实一致（denied/not_observed/background 无返回边）', async () => {
    if (!mounted) return;
    const req = mounted.el.querySelectorAll('.vue-flow__edge.edge-request').length;
    const ret = mounted.el.querySelectorAll('.vue-flow__edge.edge-return').length;
    // mock：14 span，1个无父根节点 → request=13；有事实返回的 success/error span=11 → return=11
    expect(req).toBe(13);
    expect(ret).toBe(11);
    const total = mounted.el.querySelectorAll('.vue-flow__edge').length;
    expect(total).toBe(24);
    expect(mounted.el.textContent).toContain('点击左侧节点或箭头查看执行详情');
  });
});