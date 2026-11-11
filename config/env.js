const path = require("node:path");
const dotenv = require("dotenv");

if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: path.resolve(__dirname, "..", ".env"),
    quiet: true,
  });
}

function parsePort(rawPort, fallback = 8080) {
  if (rawPort === undefined || rawPort === null || String(rawPort).trim() === "") {
    return fallback;
  }
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return NaN;
  }
  return parsed;
}

function parsePositiveInt(rawValue, fallback) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function readEnv() {
  const nodeEnv = (process.env.NODE_ENV || "development").trim() || "development";
  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: parsePort(process.env.PORT, 8080),
    atlasDbUrl: (process.env.ATLASDB_URL || "").trim(),
    sessionSecret: process.env.SECRET || "",
    cloudinary: {
      cloudName: (process.env.CLOUD_NAME || "").trim(),
      apiKey: (process.env.CLOUD_API_KEY || "").trim(),
      apiSecret: (process.env.CLOUD_API_SECRET || "").trim(),
      folder: (process.env.CLOUD_FOLDER || "wanderlust_DEV").trim(),
    },
    mapbox: {
      token: (process.env.MAP_TOKEN || "").trim(),
    },
    rateLimit: {
      authWindowMs: parsePositiveInt(
        process.env.AUTH_RATE_LIMIT_WINDOW_MS,
        15 * 60 * 1000
      ),
      authMaxAttempts: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 10),
    },
    dnsServers: ["8.8.8.8", "8.8.4.4"],
  };
}

const env = readEnv();

function validateCoreEnv(config = env) {
  const missing = [];
  if (!config.atlasDbUrl) {
    missing.push("ATLASDB_URL");
  }
  if (!config.sessionSecret) {
    missing.push("SECRET");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}.`
    );
  }
  if (Number.isNaN(config.port)) {
    throw new Error(
      "Invalid PORT environment variable. Must be an integer between 0 and 65535."
    );
  }
  return true;
}

function validateEnv(config = env, { requireIntegrations = false } = {}) {
  validateCoreEnv(config);

  const missingIntegrations = [];
  if (!config.cloudinary.cloudName) missingIntegrations.push("CLOUD_NAME");
  if (!config.cloudinary.apiKey) missingIntegrations.push("CLOUD_API_KEY");
  if (!config.cloudinary.apiSecret) missingIntegrations.push("CLOUD_API_SECRET");
  if (!config.mapbox.token) missingIntegrations.push("MAP_TOKEN");

  if (requireIntegrations && missingIntegrations.length > 0) {
    throw new Error(
      `Missing required integration environment variable(s): ${missingIntegrations.join(", ")}.`
    );
  }

  return {
    valid: true,
    missingIntegrations,
  };
}

module.exports = {
  env,
  readEnv,
  validateCoreEnv,
  validateEnv,
  parsePort,
  parsePositiveInt,
};

