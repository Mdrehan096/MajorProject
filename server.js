const { env, validateEnv } = require("./config/env.js");
const { connectDB, disconnectDB } = require("./config/db.js");
const { logInfo, logWarn, logError } = require("./utils/logger.js");

let activeServer = null;
let activeApp = null;
let isShuttingDown = false;

async function shutdown(signal, exitCode = 0, { exitProcess = true } = {}) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  if (signal) {
    logInfo("server.shutdown_started", { signal, exitCode });
  }

  const timeoutMs = env.shutdownTimeoutMs || 10000;
  const forceTimer = setTimeout(() => {
    logWarn("server.shutdown_timeout", { timeoutMs });
    if (activeServer && typeof activeServer.closeAllConnections === "function") {
      activeServer.closeAllConnections();
    }
    if (exitProcess) {
      process.exit(exitCode || 1);
    }
  }, timeoutMs);
  if (typeof forceTimer.unref === "function") {
    forceTimer.unref();
  }

  try {
    if (activeServer) {
      const serverToClose = activeServer;
      activeServer = null;
      await new Promise((resolve) => {
        serverToClose.close(() => resolve());
        if (typeof serverToClose.closeIdleConnections === "function") {
          serverToClose.closeIdleConnections();
        }
      });
    }

    if (activeApp && typeof activeApp.closeSessionStore === "function") {
      await activeApp.closeSessionStore();
    }

    await disconnectDB();
    logInfo("server.shutdown_completed", { signal: signal || "manual" });
  } catch (err) {
    logError("server.shutdown_failed", {
      message: err?.message || "Unknown error",
    });
    exitCode = 1;
  } finally {
    clearTimeout(forceTimer);
    if (exitProcess) {
      process.exit(exitCode);
    }
  }
}

async function startServer() {
  try {
    const envCheck = validateEnv();
    if (envCheck.missingIntegrations.length > 0) {
      logWarn("env.missing_optional_integrations", {
        keys: envCheck.missingIntegrations,
      });
    }

    await connectDB(env.atlasDbUrl);

    const app = require("./app.js");
    activeApp = app;

    const server = await new Promise((resolve, reject) => {
      const httpServer = app.listen(env.port);

      const onError = (err) => {
        httpServer.removeListener("listening", onListening);
        reject(err);
      };

      const onListening = () => {
        httpServer.removeListener("error", onError);
        resolve(httpServer);
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
    });

    activeServer = server;
    isShuttingDown = false;
    const address = server.address();
    const boundPort =
      address && typeof address === "object" ? address.port : env.port;
    logInfo("server.started", {
      port: boundPort,
      nodeEnv: env.nodeEnv,
    });

    server.on("error", (err) => {
      logError("server.http_error", { message: err?.message || "Unknown error" });
    });

    return server;
  } catch (err) {
    logError("server.startup_failed", {
      message: err?.message || "Unknown error",
    });
    try {
      if (activeApp && typeof activeApp.closeSessionStore === "function") {
        await activeApp.closeSessionStore();
      }
      await disconnectDB();
    } catch (_) {}
    throw err;
  }
}

if (require.main === module) {
  process.on("SIGINT", () => {
    shutdown("SIGINT", 0);
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM", 0);
  });

  process.on("unhandledRejection", (reason) => {
    const msg =
      reason instanceof Error ? reason.message : String(reason || "Unknown error");
    logError("process.unhandled_rejection", { message: msg });
    shutdown("unhandledRejection", 1);
  });

  process.on("uncaughtException", (err) => {
    logError("process.uncaught_exception", {
      message: err?.message || "Unknown error",
    });
    shutdown("uncaughtException", 1);
  });

  startServer().catch(() => {
    process.exit(1);
  });
}

module.exports = {
  startServer,
  shutdown,
};

