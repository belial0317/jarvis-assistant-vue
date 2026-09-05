import { describe, expect, it } from 'vitest';

import { estimateTokens } from './estimate';

describe('S10/T5 estimateTokens(粗粒度 token 估算)', () => {
  it('空串返回 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('纯中文 ≈ 1 字/token', () => {
    expect(estimateTokens('感知能力优化闭环')).toBe(8);
  });

  it('纯英文 ≈ 4 字符/token(向上取整)', () => {
    expect(estimateTokens('abcdefgh')).toBe(2); // 8/4
    expect(estimateTokens('abcde')).toBe(2); // 5/4 → ceil 2
  });

  it('中英混排:CJK 逐字 + 非 CJK 折算', () => {
    // 4 中文 + 4 英文字符 = 4 + ceil(4/4) = 5
    expect(estimateTokens('感知test测试')).toBe(5);
  });

  it('全角标点/假名按 CJK 计', () => {
    expect(estimateTokens('，。！')).toBe(3);
    expect(estimateTokens('テスト')).toBe(3);
  });
});
