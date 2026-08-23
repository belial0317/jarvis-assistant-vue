/**
 * PP3 内容哈希：FNV-1a 64 位（同步、无依赖）。
 * 用途：摘要去重键（后端 Redis 24h 缓存）——非安全场景，冲突概率可忽略。
 * 输入口径：(currentRoute + '\x00' + pageContext)，与后端缓存键一一对应。
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** 计算 FNV-1a 64 位哈希，返回 16 位 hex 字符串 */
export function fnv1a64(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * 摘要去重键：route JSON 与页面文本联合哈希。
 * 长度前缀彻底消除拼接歧义（两输入任一变化 → 不同 key → 重新生成摘要）。
 */
export function summaryHash(currentRoute: string, pageContext: string): string {
  return fnv1a64(`${currentRoute.length}:${currentRoute}\x00${pageContext}`);
}
