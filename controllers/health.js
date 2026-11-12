const healthService = require("../services/healthService.js");

module.exports.checkHealth = (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json(healthService.getLivenessStatus());
};

module.exports.checkReadiness = (req, res) => {
  const readiness = healthService.getReadinessStatus();
  res.set("Cache-Control", "no-store");
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.status,
    database: readiness.database,
    timestamp: readiness.timestamp,
  });
};
