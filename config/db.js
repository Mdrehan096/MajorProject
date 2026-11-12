const dns = require("node:dns");
const mongoose = require("mongoose");
const { env } = require("./env.js");
const { logInfo, logWarn, logError } = require("../utils/logger.js");

let listenersAttached = false;

const DB_STATE_LABELS = Object.freeze({
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
});

function configureDatabaseDns(mongoUrl = env.atlasDbUrl, dnsServers = env.dnsServers) {
  if (
    typeof mongoUrl === "string" &&
    mongoUrl.startsWith("mongodb+srv://") &&
    Array.isArray(dnsServers) &&
    dnsServers.length > 0
  ) {
    dns.setServers(dnsServers);
  }
}

function ensureConnectionListeners() {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;

  mongoose.connection.on("error", (err) => {
    logError("db.connection_error", { message: err?.message || "Unknown error" });
  });

  mongoose.connection.on("disconnected", () => {
    logWarn("db.disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    logInfo("db.reconnected");
  });
}

function getDatabaseHealth() {
  const readyState = mongoose.connection?.readyState ?? 0;
  return {
    connected: readyState === 1,
    readyState,
    stateLabel: DB_STATE_LABELS[readyState] || "unknown",
  };
}

async function connectDB(mongoUrl = env.atlasDbUrl) {
  if (!mongoUrl || typeof mongoUrl !== "string") {
    throw new Error("Missing required MongoDB connection string (ATLASDB_URL).");
  }

  configureDatabaseDns(mongoUrl);
  ensureConnectionListeners();

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const connectOptions = {
    maxPoolSize: env.db?.maxPoolSize || 10,
    serverSelectionTimeoutMS: env.db?.serverSelectionTimeoutMS || 10000,
    socketTimeoutMS: env.db?.socketTimeoutMS || 45000,
  };

  await mongoose.connect(mongoUrl, connectOptions);
  logInfo("db.connected", { maxPoolSize: connectOptions.maxPoolSize });
  return mongoose.connection;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  configureDatabaseDns,
  getDatabaseHealth,
};

