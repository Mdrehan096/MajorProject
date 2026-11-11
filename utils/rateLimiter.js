const ExpressError = require("./ExpressError.js");

/**
 * Reusable fixed-window in-memory rate limiter for Express routes.
 * Intended for authentication and brute-force protection without external dependencies.
 */
function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyPrefix = "global",
  message = "Too many requests. Please try again later.",
  keyGenerator,
} = {}) {
  const store = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetTime <= now) {
        store.delete(key);
      }
    }
  }, windowMs);

  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const rawKey =
      (typeof keyGenerator === "function" ? keyGenerator(req) : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      "unknown";
    const normalizedKey = String(rawKey).replace(/^::ffff:/, "");
    const key = `${keyPrefix}:${normalizedKey}`;

    let entry = store.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (entry.count > max) {
      res.setHeader("Retry-After", String(resetSeconds));
      return next(new ExpressError(429, message));
    }

    next();
  };
}

module.exports = { createRateLimiter };

