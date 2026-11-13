/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * Serverless-safe by design: no timers, no sockets, no state that survives a cold start, and
 * no reliance on sticky sessions. Each warm instance keeps its own window - with N instances
 * the effective ceiling is roughly N x max per window, which is fine for a read-only TV
 * endpoint. Cleanup is lazy (a sweep on the next request after the window), so nothing keeps
 * the process alive.
 */
function createRateLimiter({ windowMs = 60 * 1000, max = 60 } = {}) {
  const buckets = new Map();
  let lastSweep = Date.now();

  return function rateLimit(req, res, next) {
    const now = Date.now();

    // Drop expired buckets at most once per window, and hard-cap the map so a flood of
    // unique addresses can't grow memory without bound.
    if (now - lastSweep > windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweep = now;
      if (buckets.size > 5000) {
        for (const key of buckets.keys()) {
          buckets.delete(key);
          if (buckets.size <= 4000) break;
        }
      }
    }

    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const key = forwarded || req.ip || "unknown";

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ message: "Too many requests. Please try again shortly." });
    }

    bucket.count += 1;
    next();
  };
}

module.exports = { createRateLimiter };
