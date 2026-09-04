import { beforeEach, describe, expect, it, vi } from 'vitest';

// T1-2:感知 API 收编统一 client —— mock 掉真实传输层,只验证契约形状
const postMock = vi.fn();
vi.mock('./client', () => ({
  aiRequestClient: {
    post: (...args: unknown[]) => postMock(...args),
    get: vi.fn(),
  },
}));

import {
  fetchPageIntents,
  fetchPageProfile,
  summarizeContext,
} from './chat';

describe('T1 感知 API 契约(api/chat)', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('fetchPageProfile:快照字段平铺 POST /chat/perception/insight,探测性静默', async () => {
    postMock.mockResolvedValueOnce({
      businessContent: '网关供应商管理页',
      dataStatus: '3 条记录',
      topics: ['供应商'],
    });
    const payload = {
      epoch: { configId: 'c1', configVersion: 2 },
      routePath: '/gateway',
      capturedAt: 123,
      mutationCount: 0,
      stale: false,
      text: '页面内容',
    };
    const data = await fetchPageProfile(payload);
    expect(postMock).toHaveBeenCalledWith(
      '/chat/perception/insight',
      payload,
      { __silent: true },
    );
    expect(data?.businessContent).toBe('网关供应商管理页');
  });

  it('fetchPageIntents:快照嵌套 snapshot 字段(对齐后端 IntentRequest 契约)', async () => {
    postMock.mockResolvedValueOnce([{ text: '当前页有多少供应商?' }]);
    const snapshot = {
      epoch: { configId: 'fallback', configVersion: 1 },
      routePath: '/billing',
      capturedAt: 1,
      mutationCount: 0,
      stale: false,
      text: '账单内容',
    };
    await fetchPageIntents({
      snapshot,
      sessionTrail: '无',
      recentUserMessages: [],
    });
    const [url, body] = postMock.mock.calls[0]!;
    expect(url).toBe('/chat/perception/intents');
    expect(body).toEqual({
      snapshot,
      sessionTrail: '无',
      recentUserMessages: [],
    });
  });

  it('summarizeContext:透传 contentHash 与 signal(T1-6 超时中止贯通)', async () => {
    postMock.mockResolvedValueOnce('一句话摘要');
    const ctrl = new AbortController();
    const out = await summarizeContext(
      '{"path":"/a"}',
      '内容',
      'deadbeef',
      ctrl.signal,
    );
    expect(postMock).toHaveBeenCalledWith(
      '/chat/summarize-context',
      { currentRoute: '{"path":"/a"}', pageContext: '内容', contentHash: 'deadbeef' },
      { signal: ctrl.signal, __silent: true },
    );
    expect(out).toBe('一句话摘要');
  });

  it('summarizeContext:不传 contentHash/signal 时请求体与旧契约一致', async () => {
    postMock.mockResolvedValueOnce('');
    await summarizeContext('{}', '文本');
    expect(postMock).toHaveBeenCalledWith('/chat/summarize-context', {
      currentRoute: '{}',
      pageContext: '文本',
    }, { signal: undefined, __silent: true });
  });
});
