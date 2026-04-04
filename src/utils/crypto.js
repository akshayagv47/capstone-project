const crypto = require("crypto");

function generateApiKey() {
  return `ak_${crypto.randomBytes(16).toString("hex")}`;
}

function generateApiSecret() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = {
  generateApiKey,
  generateApiSecret,
};
