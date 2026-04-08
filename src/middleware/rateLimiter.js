const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const RedisStore = require("rate-limit-redis").default;
const redis = require("../lib/redis");

function getStore(prefix) {
  if (!redis) {
    return undefined;
  }

  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: prefix,
  });
}

function createAdaptiveLimiter(options, prefix) {
  const memoryLimiter = rateLimit({
    ...options,
    store: undefined,
  });

  const store = getStore(prefix);
  if (!store) {
    return memoryLimiter;
  }

  const redisLimiter = rateLimit({
    ...options,
    store,
  });

  return (req, res, next) => {
    if (redis && redis.status === "ready") {
      return redisLimiter(req, res, next);
    }

    return memoryLimiter(req, res, next);
  };
}

const authLimiter = createAdaptiveLimiter({
  windowMs: 15 * 60 * 1000, 
  max: 10,
  standardHeaders: true, 
  legacyHeaders: false, 
  passOnStoreError: true,
  message: { message: "Too many login/register attempts, please try again after 15 minutes" },
}, "rl:auth:");

const b2bApiLimiter = createAdaptiveLimiter({
  windowMs: 1 * 60 * 1000, 
  max: 100, 
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  keyGenerator: (req) => {
    if (req.apiClient) {
      return req.apiClient.apiKeyId;
    }

    // Use the helper to avoid IPv6 bypass issues
    return ipKeyGenerator(req);
  },
  message: { message: "API rate limit exceeded. You are allowed 100 requests per minute." },
}, "rl:b2b:");

const generalLimiter = createAdaptiveLimiter({
  windowMs: 5 * 60 * 1000, 
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  message: { message: "Too many requests, please try again later." },
}, "rl:gen:");

module.exports = {
  authLimiter,
  b2bApiLimiter,
  generalLimiter,
};
