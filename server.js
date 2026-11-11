const { env, validateEnv } = require("./config/env.js");
const { connectDB, disconnectDB } = require("./config/db.js");

let activeServer = null;
let activeApp = null;
let isShuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  if (signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
  }

  try {
    if (activeServer) {
      await new Promise((resolve) => {
        activeServer.close(() => resolve());
      });
      activeServer = null;
    }

    if (activeApp && typeof activeApp.closeSessionStore === "function") {
      await activeApp.closeSessionStore();
    }

    await disconnectDB();
  } catch (err) {
    console.error("Error during shutdown:", err?.message || "Unknown error");
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
}

async function startServer() {
  try {
    const envCheck = validateEnv();
    if (envCheck.missingIntegrations.length > 0) {
      console.warn(
        `Warning: Missing optional integration env var(s): ${envCheck.missingIntegrations.join(", ")}.`
      );
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
    const address = server.address();
    const boundPort =
      address && typeof address === "object" ? address.port : env.port;
    console.log(`Server running on port ${boundPort}`);

    server.on("error", (err) => {
      console.error("HTTP server error:", err?.message || "Unknown error");
    });

    return server;
  } catch (err) {
    console.error("Server startup failed:", err?.message || "Unknown error");
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
    console.error("Unhandled Promise Rejection:", msg);
    shutdown("unhandledRejection", 1);
  });

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err?.message || "Unknown error");
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

