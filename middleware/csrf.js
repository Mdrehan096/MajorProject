const crypto = require("node:crypto");
const ExpressError = require("../utils/ExpressError.js");
const { cleanupFileIfUncommitted } = require("../utils/cloudinaryCleanup.js");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isValidCsrfToken(submittedToken, sessionToken) {
  if (typeof submittedToken !== "string" || typeof sessionToken !== "string") {
    return false;
  }
  if (!submittedToken || !sessionToken) {
    return false;
  }
  const submittedBuf = Buffer.from(submittedToken, "utf8");
  const sessionBuf = Buffer.from(sessionToken, "utf8");
  if (submittedBuf.length !== sessionBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(submittedBuf, sessionBuf);
}

function attachCsrfToken(req, res, next) {
  if (req.session && !req.session.csrfToken && SAFE_METHODS.has(req.method)) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session?.csrfToken || "";
  next();
}

async function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const bodyToken =
    req.body && typeof req.body._csrf === "string" ? req.body._csrf : null;
  const headerToken = req.get("x-csrf-token") || req.get("csrf-token") || null;
  const submittedToken = bodyToken || headerToken;
  const sessionToken = req.session?.csrfToken;

  if (!isValidCsrfToken(submittedToken, sessionToken)) {
    await cleanupFileIfUncommitted(req);
    return next(
      new ExpressError(
        403,
        "Invalid or missing CSRF token. Please refresh the page and try again."
      )
    );
  }

  next();
}

function isMultipartListingUploadRoute(req) {
  if (!req.is("multipart/form-data")) {
    return false;
  }
  const normalizedPath = req.path.replace(/\/+$/, "") || "/";
  if (req.method === "POST" && normalizedPath === "/listings") {
    return true;
  }
  if (req.method === "PUT" && /^\/listings\/[^/]+$/.test(normalizedPath)) {
    return true;
  }
  return false;
}

// Multipart upload routes verify CSRF immediately after Multer parses fields.
function csrfProtection(req, res, next) {
  if (isMultipartListingUploadRoute(req)) {
    return next();
  }
  return verifyCsrf(req, res, next);
}

module.exports = {
  SAFE_METHODS,
  isValidCsrfToken,
  attachCsrfToken,
  verifyCsrf,
  isMultipartListingUploadRoute,
  csrfProtection,
};

