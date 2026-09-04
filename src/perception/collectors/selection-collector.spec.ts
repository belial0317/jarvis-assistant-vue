import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SelectionCollector } from './selection-collector';

/**
 * S4/T3 选中文本采集器单测。
 * jsdom 的 Selection 能力有限,统一 stub window.getSelection。
 */

type FakeSelection = {
  isCollapsed: boolean;
  rangeCount: number;
  anchorNode: Node | null;
  toString: () => string;
} | null;

let fakeSelection: FakeSelection = null;

vi.stubGlobal('getSelection', () => fakeSelection);

function textNodeIn(parent: HTMLElement, text = 'anchor'): Text {
  const node = document.createTextNode(text);
  parent.appendChild(node);
  return node;
}

describe('S4/T3 SelectionCollector', () => {
  let onChange: ReturnType<typeof vi.fn>;
  let collector: SelectionCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    onChange = vi.fn();
    collector = new SelectionCollector(onChange);
    collector.start();
  });

  afterEach(() => {
    collector.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fireSelectionChange() {
    document.dispatchEvent(new Event('selectionchange'));
  }

  function textNodeInHost(parent: HTMLElement): Node {
    return document.createTextNode('x');
    function helper() {
      return parent;
    }
    void helper;
    void textNodeInHost;
  }

  it('正常选区:防抖后更新文本并回调', () => {
    const host = document.createElement('div');
    const node = document.createTextNode('n');
    host.appendChild(node);
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node,
      toString: () => '  用户选中的业务数据  ',
    };

    fireSelectionChange();
    expect(onChange).not.toHaveBeenCalled(); // 防抖窗口内
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('用户选中的业务数据');
    expect(onChange).toHaveBeenCalledWith('用户选中的业务数据');
  });

  it('初始塌陷(从未选中)→ 空串', () => {
    fakeSelection = {
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: null,
      toString: () => '',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('');
  });

  it('塌陷保留:选中后点击按钮使选区塌陷,已捕获文本不丢失(S4 核心行为)', () => {
    const host = document.createElement('div');
    const node = document.createTextNode('n');
    host.appendChild(node);
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node,
      toString: () => '订单 ORD-003 ¥23,400',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('订单 ORD-003 ¥23,400');

    // 用户点击按钮 → 选区塌陷
    fakeSelection = {
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: null,
      toString: () => '',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('订单 ORD-003 ¥23,400');
  });

  it('敏感控件内选区 → 显式清空已捕获值', () => {
    const host = document.createElement('div');
    const node = document.createTextNode('n');
    host.appendChild(node);
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node,
      toString: () => '正常选中',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('正常选中');

    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    document.body.appendChild(input);
    const node2 = document.createTextNode('n2');
    Object.defineProperty(node2, 'parentElement', { value: input });
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node2,
      toString: () => 'input 内选区',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('');
  });

  it('输入框/密码框内选区不采集(敏感输入不外泄)', () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'password');
    document.body.appendChild(input);
    const node = textNodeIn(input.parentElement ?? document.body);
    // 直接把 anchor 挂到 input 上(closest('input') 命中)
    Object.defineProperty(node, 'parentElement', { value: input });

    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node,
      toString: () => 'secret',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('');
  });

  it('超长选区截断到 2000 字符', () => {
    const host = document.createElement('div');
    const node = document.createTextNode('n');
    host.appendChild(node);
    const long = 'x'.repeat(2500);
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: node,
      toString: () => long,
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText().length).toBe(2000);
  });

  it('防抖:窗口内多次触发只读取一次', () => {
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: document.createElement('div'),
      toString: () => 'a',
    };
    fireSelectionChange();
    fireSelectionChange();
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stop:清空当前选中并停止监听', () => {
    fakeSelection = {
      isCollapsed: false,
      rangeCount: 1,
      anchorNode: document.createElement('div'),
      toString: () => 'will-clear',
    };
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(collector.getText()).toBe('will-clear');

    collector.stop();
    expect(collector.getText()).toBe('');
    onChange.mockClear();
    fireSelectionChange();
    vi.advanceTimersByTime(600);
    expect(onChange).not.toHaveBeenCalled();
  });
});
