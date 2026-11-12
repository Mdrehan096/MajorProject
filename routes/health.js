const express = require("express");
const router = express.Router();
const healthController = require("../controllers/health.js");

router.get("/health", healthController.checkHealth);
router.get("/ready", healthController.checkReadiness);

module.exports = router;
