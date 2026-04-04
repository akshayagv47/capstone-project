const redis = require("../lib/redis");

/**
 * Middleware to cache API responses in Redis.
 * @param {number} durationInSeconds - How long to keep the data in cache
 */
function cacheMiddleware(durationInSeconds = 300) {
  return async (req, res, next) => {
    // If Redis is not connected or method is not GET, skip caching
    if (!redis || req.method !== "GET") {
      return next();
    }

    // Use the request URL as the unique cache key 
    // Example: cache:/api/b2b/states?limit=10
    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await redis.get(key);

      // Cache Hit: Return data immediately without hitting the database
      if (cachedResponse) {
        res.setHeader("X-Cache", "HIT");
        return res.status(200).json(JSON.parse(cachedResponse));
      }

      // Cache Miss: Intercept the res.json method to save the data before sending it
      res.setHeader("X-Cache", "MISS");
      const originalJson = res.json.bind(res);
      
      res.json = (body) => {
        // Save stringified JSON to Redis with Expiry (TTL) asynchronously
        redis.setex(key, durationInSeconds, JSON.stringify(body)).catch(err => {
          console.error("Redis setex error:", err);
        });

        // Continue sending the response to the user
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error("Redis Cache Error:", error);
      // On error, continue to the route handler normally without crashing the app
      next();
    }
  };
}

module.exports = {
  cacheMiddleware,
};
