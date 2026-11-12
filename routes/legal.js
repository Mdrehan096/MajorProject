const express = require("express");
const router = express.Router();
const legalController = require("../controllers/legal.js");

router.get("/privacy", legalController.renderPrivacyPolicy);
router.get("/terms", legalController.renderTerms);

module.exports = router;

