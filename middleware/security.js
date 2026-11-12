const crypto = require("node:crypto");
const safeJson = require("../utils/safeJson.js");
const { getDefaultListingQuery } = require("../utils/listingOptions.js");

function securityHeadersMiddleware(isProduction = false) {
  return (req, res, next) => {
    const cspNonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = cspNonce;

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${cspNonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://api.mapbox.com`,
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://api.mapbox.com",
        "font-src 'self' data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://*.mapbox.com https://*.tiles.mapbox.com",
        "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://cdn.jsdelivr.net",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
      ].join("; ")
    );

    if (isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains"
      );
    }

    next();
  };
}

function attachLocals(req, res, next) {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  res.locals.safeJson = safeJson;
  res.locals.listingQuery = getDefaultListingQuery();
  next();
}

module.exports = {
  securityHeadersMiddleware,
  attachLocals,
};

