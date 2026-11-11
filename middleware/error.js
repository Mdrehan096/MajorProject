const ExpressError = require("../utils/ExpressError.js");
const { cleanupFileIfUncommitted } = require("../utils/cloudinaryCleanup.js");

function notFoundHandler(req, res, next) {
  next(new ExpressError(404, "Page Not Found"));
}

function createErrorHandler(isProduction = false) {
  return (err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    Promise.resolve(cleanupFileIfUncommitted(req)).finally(() => {
      const statusCode =
        err.statusCode || (err.name === "CastError" ? 400 : 500);
      const rawMessage = err?.message || "Something went wrong!";
      const message =
        statusCode >= 500 && isProduction ? "Something went wrong!" : rawMessage;

      console.error(
        `[Error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${rawMessage}`
      );
      res.status(statusCode).render("error.ejs", { message });
    });
  };
}

module.exports = {
  notFoundHandler,
  createErrorHandler,
};

