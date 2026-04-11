const redis = require("../lib/redis");

const cacheMiddleware = (ttl = 3600) => {
  return async (req, res, next) => {
    try {
      const key = req.originalUrl;

      const cachedData = await redis.get(key);

      // ✅ If cache exists
      if (cachedData) {
        console.log("CACHE HIT");
        return res
          .set("X-Cache", "HIT")
          .json(JSON.parse(cachedData));
      }

      console.log("CACHE MISS");

      // ❗ Override res.json to store response
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        redis.set(key, JSON.stringify(body), "EX", ttl);

        return originalJson(body);
      };

      res.set("X-Cache", "MISS");

      next();
    } catch (err) {
      next();
    }
  };
};

module.exports = { cacheMiddleware };