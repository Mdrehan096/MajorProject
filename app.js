const path = require("node:path");
const express = require("express");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const flash = require("connect-flash");
const session = require("express-session");

const { env, validateCoreEnv } = require("./config/env.js");
const { createSessionOptions } = require("./config/session.js");
const { configurePassport } = require("./config/passport.js");
const {
  securityHeadersMiddleware,
  attachLocals,
  attachCsrfToken,
  authRateLimitMiddleware,
  csrfProtection,
  notFoundHandler,
  createErrorHandler,
} = require("./middleware");
const rootRouter = require("./routes");

function createApp({ sessionStore, sessionOptions } = {}) {
  if (!sessionStore && !sessionOptions) {
    validateCoreEnv(env);
  }

  const app = express();
  const isProduction = env.isProduction;

  app.disable("x-powered-by");
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(securityHeadersMiddleware(isProduction));

  const bodyLimit = env.bodyLimit || "100kb";
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
  app.use(express.json({ limit: bodyLimit }));
  app.use(methodOverride("_method"));
  app.use(
    express.static(
      path.join(__dirname, "public"),
      isProduction ? { maxAge: "1d", etag: true } : { etag: true }
    )
  );
  app.engine("ejs", ejsMate);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  const resolvedSessionOptions =
    sessionOptions ||
    createSessionOptions({
      store: sessionStore,
      mongoUrl: env.atlasDbUrl,
      secret: env.sessionSecret,
      isProduction,
    });
  app.use(session(resolvedSessionOptions));
  app.use(flash());

  configurePassport(app);

  app.use(attachLocals);
  app.use(attachCsrfToken);
  app.use(authRateLimitMiddleware);
  app.use(csrfProtection);

  app.use("/", rootRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(isProduction));

  app.closeSessionStore = async () => {
    const store = resolvedSessionOptions?.store;
    if (!store) {
      return;
    }
    if (store.collectionP) {
      await Promise.resolve(store.collectionP).catch(() => {});
    }
    if (!store._usesMongooseClient && typeof store.close === "function") {
      await store.close();
    }
  };

  return app;
}

const app = createApp();
app.createApp = createApp;

module.exports = app;
