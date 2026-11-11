const dns = require("node:dns");
const mongoose = require("mongoose");
const { env } = require("./env.js");

let listenersAttached = false;

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
    console.error("MongoDB connection error:", err?.message || "Unknown error");
  });
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

  await mongoose.connect(mongoUrl);
  console.log("Connected to DB");
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
};

