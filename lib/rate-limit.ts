/**
 * In-process token-bucket rate limiter.
 *
 * Suitable for single-instance deployments (one Node process). For
 * multi-instance — separate Vercel functions or autoscaled containers —
 * swap for a distributed store (Upstash Redis, Cloudflare KV, etc.).
 *
 * Usage:
 *   const chatLimit = createRateLimit({ max: 20, windowMs: 60_000 });
 *   const { allowed, retryAfter } = chatLimit.check(`user-${userId}`);
 *   if (!allowed) return tooManyRequests();
 */

interface BucketState {
  tokens: number;
  updatedAt: number;
}

interface CheckResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (when not allowed). */
  retryAfter: number;
}

interface RateLimitOptions {
  /** Max tokens (= max requests in a full window). */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimit {
  check(key: string): CheckResult;
}

export function createRateLimit({ max, windowMs }: RateLimitOptions): RateLimit {
  if (max <= 0 || windowMs <= 0) {
    throw new Error("rate-limit: max and windowMs must be > 0");
  }

  const buckets = new Map<string, BucketState>();
  const refillPerMs = max / windowMs;
  // Evict buckets idle longer than this — keeps memory bounded.
  const idleTtlMs = windowMs * 4;
  let lastSweep = Date.now();

  function sweep(now: number) {
    if (now - lastSweep < idleTtlMs) return;
    for (const [key, bucket] of buckets) {
      if (now - bucket.updatedAt > idleTtlMs) buckets.delete(key);
    }
    lastSweep = now;
  }

  return {
    check(key: string): CheckResult {
      const now = Date.now();
      sweep(now);

      const bucket = buckets.get(key) ?? { tokens: max, updatedAt: now };
      const elapsed = now - bucket.updatedAt;
      bucket.tokens = Math.min(max, bucket.tokens + elapsed * refillPerMs);
      bucket.updatedAt = now;

      if (bucket.tokens < 1) {
        const tokensNeeded = 1 - bucket.tokens;
        const retryAfter = Math.max(1, Math.ceil(tokensNeeded / refillPerMs / 1000));
        buckets.set(key, bucket);
        return { allowed: false, retryAfter };
      }

      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return { allowed: true, retryAfter: 0 };
    },
  };
}

/**
 * Extract a client identifier from the request, preferring the user ID
 * (when authenticated) and falling back to the forwarded IP.
 */
export function clientKey(
  req: Request,
  userId: string | null | undefined
): string {
  if (userId) return `u:${userId}`;
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
}
