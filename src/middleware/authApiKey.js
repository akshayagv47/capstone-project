const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");

async function requireApiCredentials(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const apiSecret = req.headers["x-api-secret"];

  if (!apiKey || !apiSecret) {
    return res.status(401).json({ message: "x-api-key and x-api-secret are required" });
  }

  const keyRecord = await prisma.apiKey.findUnique({
    where: { key: String(apiKey) },
    include: { user: true },
  });

  if (!keyRecord || keyRecord.status !== "ACTIVE") {
    return res.status(401).json({ message: "Invalid API key" });
  }

  const isSecretValid = await bcrypt.compare(String(apiSecret), keyRecord.secretHash);

  if (!isSecretValid) {
    return res.status(401).json({ message: "Invalid API secret" });
  }

  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date() },
  });

  req.apiClient = {
    apiKeyId: keyRecord.id,
    userId: keyRecord.userId,
    email: keyRecord.user.email,
    role: keyRecord.user.role,
  };

  return next();
}

module.exports = {
  requireApiCredentials,
};
