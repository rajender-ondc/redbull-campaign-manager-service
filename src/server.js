"use strict";

const { createApp } = require("./app");
const { loadEnv } = require("./config/env");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const { configureTokenIssuer } = require("./services/token.service");

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Start-up order: configuration → signing key → database → HTTP server. A missing or unusable key
 * (JWT_SECRET_KEY) stops start-up before anything else happens. Stops gracefully on SIGINT/SIGTERM.
 */
async function startServer() {
  const env = loadEnv();
  configureTokenIssuer({
    privateKeyPem: env.JWT_SECRET_KEY,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
  });
  const database = await connectDatabase(env.MONGODB_URI);
  console.info(
    `Connected to MongoDB database "${database.name}" at ${database.host}:${database.port}`,
  );

  // Express 5 also calls this callback when listening fails (e.g. the port is busy). The "error"
  // handler below reports that case, so only log success here.
  const server = createApp().listen(env.PORT, (err) => {
    if (err) {
      return;
    }
    console.info(
      `Campaign manager listening on port ${env.PORT} [${env.NODE_ENV}]`,
    );
  });
  server.on("error", (err) => {
    console.error("HTTP server error; exiting.", err);
    process.exit(1);
  });

  const handleShutdownSignal = (signal) => {
    console.info(
      `${signal} received: finishing in-flight requests, then closing the database connection.`,
    );
    setTimeout(() => {
      console.error(
        `Shutdown took longer than ${SHUTDOWN_TIMEOUT_MS} ms; exiting.`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(async (err) => {
      await disconnectDatabase();
      process.exit(err ? 1 : 0);
    });
  };
  process.once("SIGINT", handleShutdownSignal);
  process.once("SIGTERM", handleShutdownSignal);
}

// Anything unexpected that escapes request handling leaves the process in an unknown state:
// log it and exit, so the platform restarts a clean instance.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection; exiting.", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception; exiting.", err);
  process.exit(1);
});

startServer().catch((err) => {
  console.error("Campaign manager failed to start:", err);
  process.exit(1);
});
