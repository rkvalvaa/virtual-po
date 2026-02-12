interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

export function rateLimit(
  key: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= windowMs) {
    bucket.tokens = limit;
    bucket.lastRefill = now;
  } else {
    const refill = Math.floor((elapsed / windowMs) * limit);
    if (refill > 0) {
      bucket.tokens = Math.min(limit, bucket.tokens + refill);
      bucket.lastRefill = now;
    }
  }

  const resetAt = bucket.lastRefill + windowMs;

  if (bucket.tokens <= 0) {
    return { allowed: false, remaining: 0, resetAt };
  }

  bucket.tokens--;
  return { allowed: true, remaining: bucket.tokens, resetAt };
}

export function rateLimitHeaders(result: {
  remaining: number;
  resetAt: number;
  limit?: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit ?? DEFAULT_LIMIT),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
