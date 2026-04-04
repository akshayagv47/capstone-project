const rateLimit = require("express-rate-limit");
const RedisStore = require("rate-limit-redis").default;
const redis = require("../lib/redis");

function getStore(prefix) {
  if (!redis) {
    return undefined; // Falls back to express-rate-limit internal memory store
  }

  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: prefix,
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10,
  standardHeaders: true, 
  legacyHeaders: false, 
  store: getStore("rl:auth:"),
  message: { message: "Too many login/register attempts, please try again after 15 minutes" },
});

const b2bApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 100, 
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore("rl:b2b:"),
  keyGenerator: (req) => {
    return req.apiClient ? req.apiClient.apiKeyId : req.ip;
  },
  message: { message: "API rate limit exceeded. You are allowed 100 requests per minute." },
});

const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore("rl:gen:"),
  message: { message: "Too many requests, please try again later." },
});

module.exports = {
  authLimiter,
  b2bApiLimiter,
  generalLimiter,
};
