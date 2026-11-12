const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { env, validateCoreEnv } = require("./env.js");
const { configureDatabaseDns } = require("./db.js");
const { logError } = require("../utils/logger.js");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_AFTER_SECONDS = 24 * 3600;

function createSessionStore({
  mongoUrl = env.atlasDbUrl,
  secret = env.sessionSecret,
} = {}) {
  const hasConnectedMongooseClient = mongoose.connection.readyState === 1;

  if (!secret || (!hasConnectedMongooseClient && !mongoUrl)) {
    validateCoreEnv({ ...env, atlasDbUrl: mongoUrl, sessionSecret: secret });
  }

  const storeOptions = {
    crypto: {
      secret,
    },
    touchAfter: SESSION_TOUCH_AFTER_SECONDS,
  };

  if (hasConnectedMongooseClient) {
    storeOptions.client = mongoose.connection.getClient();
  } else {
    configureDatabaseDns(mongoUrl);
    storeOptions.mongoUrl = mongoUrl;
  }

  const store = MongoStore.create(storeOptions);
  store._usesMongooseClient = hasConnectedMongooseClient;

  store.on("error", (err) => {
    logError("session.store_error", { message: err?.message || "Unknown error" });
  });

  return store;
}

function createSessionOptions({
  store,
  mongoUrl = env.atlasDbUrl,
  secret = env.sessionSecret,
  isProduction = env.isProduction,
} = {}) {
  if (!secret) {
    validateCoreEnv({
      ...env,
      atlasDbUrl: mongoUrl || env.atlasDbUrl,
      sessionSecret: secret,
    });
  }

  const sessionStore = store || createSessionStore({ mongoUrl, secret });

  return {
    store: sessionStore,
    secret,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: SESSION_TTL_MS,
    },
  };
}

function createSessionMiddleware(options = {}) {
  return session(createSessionOptions(options));
}

module.exports = {
  createSessionStore,
  createSessionOptions,
  createSessionMiddleware,
};
