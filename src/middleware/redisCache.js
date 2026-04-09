const redis = require("../lib/redis");

const memoryCache = new Map();

function getMemoryCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function setMemoryCache(key, value, durationInSeconds) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + durationInSeconds * 1000,
  });
}

/**
 * Middleware to cache API responses in Redis.
 * @param {number} durationInSeconds - How long to keep the data in cache
 */
function cacheMiddleware(durationInSeconds = 300) {
  return async (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    // Use the request URL as the unique cache key 
    // Example: cache:/api/b2b/states?limit=10
    const key = `cache:${req.originalUrl || req.url}`;

    // Try Redis first when configured.
    try {
      if (redis) {
        if (redis.status === "wait") {
          await redis.connect().catch(() => {});
        }

        const cachedResponse = await redis.get(key);

        // Cache Hit from Redis: Return data immediately without hitting the database
        if (cachedResponse) {
          res.setHeader("X-Cache", "HIT");
          res.setHeader("X-Cache-Store", "REDIS");
          return res.status(200).json(JSON.parse(cachedResponse));
        }
      }
    } catch (error) {
      console.error("Redis Cache Error:", error);
    }

    // Fallback cache for serverless reconnect windows.
    const memoryCachedResponse = getMemoryCache(key);
    if (memoryCachedResponse) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Cache-Store", "MEMORY");
      return res.status(200).json(memoryCachedResponse);
    }

    // Cache Miss: Intercept the res.json method to save the data before sending it
    res.setHeader("X-Cache", "MISS");
    res.setHeader("X-Cache-Store", redis ? "REDIS_OR_MEMORY" : "MEMORY");
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // Cache only successful responses to avoid storing transient/server errors.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setMemoryCache(key, body, durationInSeconds);

        if (redis) {
          redis.setex(key, durationInSeconds, JSON.stringify(body)).catch((err) => {
            console.error("Redis setex error:", err);
          });
        }
      }

      // Continue sending the response to the user
      return originalJson(body);
    };

    next();
  };
}

module.exports = {
  cacheMiddleware,
};
