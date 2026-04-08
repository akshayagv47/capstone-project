function cleanEnvValue(value) {
  if (!value) {
    return "";
  }

  const trimmed = String(value).trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function deriveUnpooledFromNeon(url) {
  if (!url || !url.includes("-pooler.")) {
    return null;
  }

  return url.replace("-pooler.", ".");
}

function resolveDatabaseUrl() {
  const explicitUnpooledUrl = cleanEnvValue(process.env.DATABASE_URL_UNPOOLED);
  const defaultDatabaseUrl = cleanEnvValue(process.env.DATABASE_URL);

  if (explicitUnpooledUrl) {
    return {
      url: explicitUnpooledUrl,
      source: "DATABASE_URL_UNPOOLED",
      derived: false,
    };
  }

  if (!defaultDatabaseUrl) {
    return {
      url: "",
      source: "",
      derived: false,
    };
  }

  const derivedUnpooledUrl = deriveUnpooledFromNeon(defaultDatabaseUrl);
  if (derivedUnpooledUrl) {
    return {
      url: derivedUnpooledUrl,
      source: "DATABASE_URL",
      derived: true,
    };
  }

  return {
    url: defaultDatabaseUrl,
    source: "DATABASE_URL",
    derived: false,
  };
}

function hasPlaceholderPassword(url) {
  return /YOUR_PASSWORD/i.test(String(url || ""));
}

module.exports = {
  resolveDatabaseUrl,
  hasPlaceholderPassword,
};