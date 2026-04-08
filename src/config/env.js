const dotenv = require("dotenv");
const { resolveDatabaseUrl, hasPlaceholderPassword } = require("../lib/databaseUrl");

dotenv.config();

const resolvedDb = resolveDatabaseUrl();

const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: resolvedDb.url,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  redisUrl: process.env.REDIS_URL,
};

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL or DATABASE_URL_UNPOOLED is required");
}

if (hasPlaceholderPassword(env.databaseUrl)) {
  throw new Error(
    `Database URL from ${resolvedDb.source || "env"} still contains YOUR_PASSWORD placeholder. Replace it with your actual Neon password.`
  );
}

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

module.exports = env;
