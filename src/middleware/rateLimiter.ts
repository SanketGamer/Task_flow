import rateLimit from 'express-rate-limit';

// Factory, not a module-level singleton: each app instance gets its own
// counter store. In production one process calls this once, so behavior
// is identical — but it avoids state leaking across app instances in tests.
export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED', details: {} },
  });
}