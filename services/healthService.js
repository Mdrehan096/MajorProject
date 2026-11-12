const { getDatabaseHealth } = require("../config/db.js");

function getLivenessStatus() {
  return {
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

function getReadinessStatus() {
  const dbHealth = getDatabaseHealth();
  return {
    ready: dbHealth.connected,
    status: dbHealth.connected ? "ready" : "not_ready",
    database: dbHealth.stateLabel,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getLivenessStatus,
  getReadinessStatus,
};
