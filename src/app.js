const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const apiKeyRoutes = require("./routes/apikey.routes");
const locationRoutes = require("./routes/locations.routes");
const { requireJwt } = require("./middleware/authJwt");
const { requireApiCredentials } = require("./middleware/authApiKey");
const { authLimiter, b2bApiLimiter, generalLimiter } = require("./middleware/rateLimiter");
const { apiLogger } = require("./middleware/apiLogger");
const { cacheMiddleware } = require("./middleware/redisCache");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Apply general rate limit to all routes
app.use(generalLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "capstone-backend" });
});

// Apply strict rate limiting to auth routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/keys", requireJwt, apiKeyRoutes);

app.get("/api/protected/ping", requireJwt, (req, res) => {
  res.status(200).json({
    message: "JWT authentication working",
    user: req.user,
  });
});

// Apply API Key-based B2B limit and Request Logger
app.get("/api/b2b/ping", requireApiCredentials, b2bApiLimiter, apiLogger, (req, res) => {
  res.status(200).json({
    message: "API key authentication working",
    client: req.apiClient,
  });
});

// Backend Dev 1 CORE APIs integrated with Backend Dev 2 SECURITY/CACHING
// We secure all location routes with API KEY validation, limit their rate, log requests, and use Redis cache (1 hr TTL)
app.use(
  "/api/b2b/locations",
  requireApiCredentials,
  b2bApiLimiter,
  apiLogger,
  cacheMiddleware(3600),
  locationRoutes
);

// Demo Route for Backend Dev 1 to use Redis Caching (1 Hour TTL)
app.get("/api/b2b/example-states", requireApiCredentials, b2bApiLimiter, apiLogger, cacheMiddleware(3600), (req, res) => {
  // Normally this data would be fetched from Prisma in roughly 150-300ms
  // With Cache, subsequent calls will fetch in <10ms!
  res.status(200).json({
    message: "This data will be fetched from the database on first request, but served from Redis on subsequent requests",
    data: [
      { id: 1, name: "Maharashtra" },
      { id: 2, name: "Uttar Pradesh" },
      { id: 3, name: "Karnataka" }
    ],
    timestamp: new Date().toISOString() // You will notice this timestamp freezes for 1 hour on multiple requests!
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
