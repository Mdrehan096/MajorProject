const ExpressError = require("../utils/ExpressError.js");
const safeJson = require("../utils/safeJson.js");
const { getDefaultListingQuery } = require("../utils/listingOptions.js");
const { cleanupFileIfUncommitted } = require("../utils/cloudinaryCleanup.js");
const { maskSensitiveText } = require("../utils/logger.js");

function notFoundHandler(req, res, next) {
  next(new ExpressError(404, "Page Not Found"));
}

function ensureErrorRenderLocals(req, res) {
  if (!res || !res.locals) {
    return;
  }
  if (!Array.isArray(res.locals.success)) {
    res.locals.success = [];
  }
  if (!Array.isArray(res.locals.error)) {
    res.locals.error = [];
  }
  if (typeof res.locals.currUser === "undefined") {
    res.locals.currUser = req?.user || null;
  }
  if (typeof res.locals.csrfToken !== "string") {
    res.locals.csrfToken = req?.session?.csrfToken || "";
  }
  if (typeof res.locals.cspNonce !== "string") {
    res.locals.cspNonce = "";
  }
  if (typeof res.locals.safeJson !== "function") {
    res.locals.safeJson = safeJson;
  }
  if (!res.locals.listingQuery) {
    res.locals.listingQuery = getDefaultListingQuery();
  }
}

function resolvePublicError(err, isProduction) {
  const statusCode =
    err?.statusCode ||
    err?.status ||
    (err?.name === "CastError" || err?.name === "MulterError" ? 400 : 500);

  if (err?.type === "entity.too.large") {
    return {
      statusCode: 413,
      message: "Request payload exceeds the allowed size limit.",
    };
  }

  if (err?.name === "MulterError") {
    return {
      statusCode: 400,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "Uploaded image exceeds the maximum allowed size."
          : "Invalid file upload payload.",
    };
  }

  if (
    err?.type === "entity.parse.failed" ||
    (err instanceof SyntaxError && statusCode === 400)
  ) {
    return {
      statusCode: 400,
      message: "Invalid request payload format.",
    };
  }

  const rawMessage = err?.message || "Something went wrong!";
  const message =
    statusCode >= 500 && isProduction ? "Something went wrong!" : rawMessage;

  return { statusCode, message };
}

function createErrorHandler(isProduction = false) {
  return (err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    Promise.resolve(cleanupFileIfUncommitted(req)).finally(() => {
      const { statusCode, message } = resolvePublicError(err, isProduction);

      const safeErrDetail = maskSensitiveText(err?.message || message);
      console.error(
        `[Error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${safeErrDetail}`
      );
      ensureErrorRenderLocals(req, res);

      if (typeof res.send === "function") {
        try {
          return res.status(statusCode).render("error.ejs", { message }, (renderErr, html) => {
            if (renderErr) {
              if (!res.headersSent) {
                return res.status(statusCode).type("text/plain").send(message);
              }
              return next(renderErr);
            }
            return res.send(html);
          });
        } catch {
          if (!res.headersSent) {
            return res.status(statusCode).type("text/plain").send(message);
          }
          return undefined;
        }
      }

      return res.status(statusCode).render("error.ejs", { message });
    });
  };
}

module.exports = {
  notFoundHandler,
  createErrorHandler,
};
