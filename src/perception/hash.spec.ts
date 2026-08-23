import { describe, expect, it } from 'vitest';

import { fnv1a64, summaryHash } from './hash';

describe('fnv1a64 / summaryHash', () => {
  it('空串返回偏移基值的 hex', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });

  it('确定性：相同输入相同输出', () => {
    expect(fnv1a64('abc')).toBe(fnv1a64('abc'));
  });

  it('区分不同输入（route 或 text 变化 → 不同 key）', () => {
    const base = summaryHash('{"path":"/a"}', 'content');
    expect(summaryHash('{"path":"/b"}', 'content')).not.toBe(base);
    expect(summaryHash('{"path":"/a"}', 'content2')).not.toBe(base);
  });

  it('含 \x00 的文本不产生歧义碰撞（分隔符保护）', () => {
    // route='a' + text='b\x00c' vs route='a\x00b' + text='c' 必须不同
    expect(summaryHash('a', 'b\x00c')).not.toBe(summaryHash('a\x00b', 'c'));
  });

  it('输出为 16 位定长 hex', () => {
    expect(fnv1a64('x')).toMatch(/^[0-9a-f]{16}$/);
  });
});
