const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { generateApiKey, generateApiSecret } = require("../utils/crypto");

const router = express.Router();

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user.sub;

    const key = generateApiKey();
    const secret = generateApiSecret();
    const secretHash = await bcrypt.hash(secret, 12);

    const record = await prisma.apiKey.create({
      data: {
        userId,
        key,
        secretHash,
      },
      select: {
        id: true,
        key: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: "API key created. Save the secret now; it will not be shown again.",
      apiKey: record,
      apiSecret: secret,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
