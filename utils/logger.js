const SENSITIVE_KEY_PATTERN =
  /^(?:password|pass|pwd|secret|sessionSecret|token|mapToken|apiKey|apiSecret|cloudApiSecret|authorization|cookie|cookies|hash|salt|atlasDbUrl|mongoUrl|_csrf)$/i;

function maskSensitiveText(value) {
  if (typeof value !== "string") {
    return String(value ?? "");
  }

  return value
    .replace(/(mongodb(?:\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/gi, "$1***:***@")
    .replace(/\b(pk|sk)\.[A-Za-z0-9._-]{8,}\b/g, "$1.***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***");
}

function sanitizeMeta(value, depth = 0) {
  if (depth > 3) {
    return "[Truncated]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return maskSensitiveText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: maskSensitiveText(value.message || "Unknown error"),
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMeta(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeMeta(entry, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function formatLogEntry(level, event, meta) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event: String(event || "app.event"),
  };
  if (meta !== undefined && meta !== null) {
    const cleaned = sanitizeMeta(meta);
    if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)) {
      Object.assign(payload, cleaned);
    } else {
      payload.detail = cleaned;
    }
  }
  return JSON.stringify(payload);
}

function logInfo(event, meta) {
  console.log(formatLogEntry("info", event, meta));
}

function logWarn(event, meta) {
  console.warn(formatLogEntry("warn", event, meta));
}

function logError(event, meta) {
  console.error(formatLogEntry("error", event, meta));
}

module.exports = {
  maskSensitiveText,
  sanitizeMeta,
  formatLogEntry,
  logInfo,
  logWarn,
  logError,
};
