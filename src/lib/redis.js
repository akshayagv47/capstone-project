const Redis = require("ioredis");
const env = require("../config/env");

let redis = null;

if (env.redisUrl) {
  redis = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  redis.on("connect", () => {
    console.log("Connected to Redis gracefully");
  });
} else {
  console.warn("⚠️ REDIS_URL mapping is missing, rate-limiting will fallback to memory temporarily.");
}

module.exports = redis;
