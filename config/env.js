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

function parsePositiveBoundedInt(rawValue, fallback, minVal, maxVal) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return fallback;
  }
  if (parsed < minVal) return minVal;
  if (parsed > maxVal) return maxVal;
  return parsed;
}

function parseBookingConfig(rawEnv = process.env) {
  return {
    defaultMaxGuests: parsePositiveBoundedInt(
      rawEnv.BOOKING_DEFAULT_MAX_GUESTS,
      8,
      1,
      50
    ),
    maxGuestsUpperLimit: 50,
    maxTxRetries: parsePositiveBoundedInt(
      rawEnv.BOOKING_TX_MAX_RETRIES,
      4,
      1,
      10
    ),
    currency: "INR",
  };
}

const VALID_TAX_MODES = Object.freeze(["indian_gst_slabs", "flat", "none"]);

function parseTaxRate(rawRate) {
  if (rawRate === undefined || rawRate === null || String(rawRate).trim() === "") {
    return null;
  }
  const parsed = Number(String(rawRate).trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return NaN;
  }
  return parsed;
}

function parsePricingConfig(rawEnv = process.env) {
  const rawMode =
    rawEnv.TAX_MODE === undefined || rawEnv.TAX_MODE === null
      ? ""
      : String(rawEnv.TAX_MODE).trim().toLowerCase();
  const parsedRate = parseTaxRate(rawEnv.TAX_RATE);

  let taxMode = rawMode;
  if (!taxMode) {
    taxMode = parsedRate !== null ? "flat" : "indian_gst_slabs";
  }

  const rawLabel =
    rawEnv.TAX_LABEL === undefined || rawEnv.TAX_LABEL === null
      ? ""
      : String(rawEnv.TAX_LABEL).trim();
  const defaultLabel =
    taxMode === "indian_gst_slabs" ? "Estimated GST" : "Estimated Tax";

  return {
    taxMode,
    taxRate: parsedRate,
    taxLabel: rawLabel || defaultLabel,
    maxStayNights: Math.min(parsePositiveInt(rawEnv.MAX_STAY_NIGHTS, 90), 365),
  };
}

function parseDnsServers(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return ["8.8.8.8", "8.8.4.4"];
  }
  const trimmed = String(rawValue).trim();
  if (!trimmed || /^(?:none|system|off|false)$/i.test(trimmed)) {
    return [];
  }
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const WEAK_SECRETS = new Set([
  "secret",
  "changeme",
  "mysupersecretcode",
  "default",
  "wanderlust",
  "test_secret",
]);

function readEnv() {
  const nodeEnv = (process.env.NODE_ENV || "development").trim() || "development";
  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    port: parsePort(process.env.PORT, 8080),
    atlasDbUrl: (process.env.ATLASDB_URL || "").trim(),
    sessionSecret: process.env.SECRET || "",
    bodyLimit: (process.env.BODY_LIMIT || "100kb").trim() || "100kb",
    shutdownTimeoutMs: parsePositiveBoundedInt(
      process.env.SHUTDOWN_TIMEOUT_MS,
      10000,
      1000,
      30000
    ),
    db: {
      maxPoolSize: parsePositiveBoundedInt(
        process.env.DB_MAX_POOL_SIZE,
        10,
        1,
        100
      ),
      serverSelectionTimeoutMS: parsePositiveBoundedInt(
        process.env.DB_SERVER_SELECTION_TIMEOUT_MS,
        10000,
        1000,
        60000
      ),
      socketTimeoutMS: parsePositiveBoundedInt(
        process.env.DB_SOCKET_TIMEOUT_MS,
        45000,
        5000,
        120000
      ),
    },
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
    pricing: parsePricingConfig(process.env),
    booking: parseBookingConfig(process.env),
    dnsServers: parseDnsServers(process.env.DB_DNS_SERVERS),
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
  if (config.isProduction) {
    const trimmedSecret = String(config.sessionSecret).trim();
    if (
      trimmedSecret.length < 32 ||
      WEAK_SECRETS.has(trimmedSecret.toLowerCase())
    ) {
      throw new Error(
        "SECRET must be at least 32 characters and non-default in production."
      );
    }
  }
  if (Number.isNaN(config.port)) {
    throw new Error(
      "Invalid PORT environment variable. Must be an integer between 0 and 65535."
    );
  }
  if (config.pricing) {
    if (!VALID_TAX_MODES.includes(config.pricing.taxMode)) {
      throw new Error(
        `Invalid TAX_MODE environment variable. Allowed values: ${VALID_TAX_MODES.join(", ")}.`
      );
    }
    if (Number.isNaN(config.pricing.taxRate)) {
      throw new Error(
        "Invalid TAX_RATE environment variable. Must be a finite percentage between 0 and 100."
      );
    }
    if (
      config.pricing.taxMode === "flat" &&
      (config.pricing.taxRate === null || !Number.isFinite(config.pricing.taxRate))
    ) {
      throw new Error(
        "TAX_RATE environment variable is required when TAX_MODE is set to 'flat'."
      );
    }
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
  parseTaxRate,
  parsePricingConfig,
  parseBookingConfig,
  parseDnsServers,
  VALID_TAX_MODES,
};

