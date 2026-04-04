const prisma = require("../lib/prisma");

function apiLogger(req, res, next) {
  // Capture start time of the request
  const startMs = Date.now();

  // Listen for the 'finish' event which occurs when the response is fully sent
  res.on("finish", () => {
    // We only log authenticated B2B requests (where req.apiClient is set by authApiKey middleware)
    if (!req.apiClient) return;

    const responseTimeMs = Date.now() - startMs;
    const { apiKeyId, userId } = req.apiClient;

    // Log asynchronously (fire-and-forget) so it doesn't block the client's response
    prisma.apiLog.create({
      data: {
        apiKeyId,
        userId,
        endpoint: req.originalUrl || req.url,
        method: req.method,
        statusCode: res.statusCode,
        responseTimeMs,
        ipAddress: req.ip || req.connection.remoteAddress,
      }
    }).catch(err => {
      // In production, use a proper logging tool like winston/pino
      console.error("Failed to save API log:", err);
    });
  });

  next();
}

module.exports = {
  apiLogger,
};
