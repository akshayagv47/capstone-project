const Redis = require("ioredis");
const env = require("../config/env");

let redis = null;

if (env.redisUrl) {
  redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    commandTimeout: 2000,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  redis.on("ready", () => {
    console.log("Connected to Redis gracefully");
  });
} else {
  console.warn("REDIS_URL is missing; Redis caching is disabled.");
}

module.exports = redis;