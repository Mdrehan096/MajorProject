const { env } = require("../config/env.js");
const { createRateLimiter } = require("../utils/rateLimiter.js");

const authWindowMs = env.rateLimit.authWindowMs;
const authMaxAttempts = env.rateLimit.authMaxAttempts;

const loginRateLimiter = createRateLimiter({
  windowMs: authWindowMs,
  max: authMaxAttempts,
  keyPrefix: "login",
  message: "Too many login attempts. Please try again later.",
});

const signupRateLimiter = createRateLimiter({
  windowMs: authWindowMs,
  max: authMaxAttempts,
  keyPrefix: "signup",
  message: "Too many signup attempts. Please try again later.",
});

function authRateLimitMiddleware(req, res, next) {
  if (req.method === "POST") {
    const normalizedPath = req.path.replace(/\/+$/, "") || "/";
    if (normalizedPath === "/login") {
      return loginRateLimiter(req, res, next);
    }
    if (normalizedPath === "/signup") {
      return signupRateLimiter(req, res, next);
    }
  }
  next();
}

module.exports = {
  loginRateLimiter,
  signupRateLimiter,
  authRateLimitMiddleware,
};

