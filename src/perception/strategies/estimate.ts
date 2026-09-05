/**
 * S10/T5:粗粒度 token 估算(纯函数,零依赖)。
 *
 * 用途:仅服务于压缩预算判定(adaptive 阈值),不追求 tokenizer 精度;
 * 估算口径:CJK 字符 ≈ 1 token,非 CJK ≈ 4 字符/token(混合文本常见经验值)。
 * 与真实 tokenizer 存在 ±20% 级偏差,可接受(预算非硬限额)。
 */

/** 粗粒度 token 估算 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    if (isCjk(ch)) cjk++;
  }
  const nonCjk = text.length - cjk;
  return cjk + Math.ceil(nonCjk / 4);
}

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0x3400 && code <= 0x4dbf) || // 扩展 A
    (code >= 0x3000 && code <= 0x303f) || // CJK 标点
    (code >= 0xff00 && code <= 0xffef) || // 全角形式
    (code >= 0x3040 && code <= 0x30ff) // 日文假名(混排场景)
  );
}
