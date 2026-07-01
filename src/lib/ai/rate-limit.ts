// 内存令牌桶,够防滥用即可,不持久化
type Bucket = number[]; // 时间戳列表

class RateLimiter {
  private buckets = new Map<string, Bucket>();

  /** 返回 true 表示允许,false 表示被限流 */
  check(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = this.buckets.get(key) ?? [];
    // 清理过期
    const fresh = bucket.filter((t) => t > cutoff);
    if (fresh.length >= max) {
      this.buckets.set(key, fresh);
      return false;
    }
    fresh.push(now);
    this.buckets.set(key, fresh);
    return true;
  }

  /** 测试用:清理所有 bucket */
  reset(): void {
    this.buckets.clear();
  }
}

export const aiRateLimiter = new RateLimiter();