"use strict";

const express = require("express");
const apiRouter = require("./routes");
const { handleError, handleNotFound } = require("./middlewares/errorHandler");

/**
 * Creates the Express application without starting a server.
 * server.js starts it for real; tests pass it straight to supertest.
 */
function createApp() {
  const app = express();
  app.disable("x-powered-by"); // don't advertise the framework
  app.set("etag", false); // ETags are set explicitly from currentVersionNo

  app.use(express.json({ limit: "100kb" }));
  app.use("/api", preventCaching);
  app.use("/api/v1", apiRouter);

  app.use(handleNotFound);
  app.use(handleError);
  return app;
}

/**
 * API responses carry tokens and signed-in business or personal data, so no browser, proxy or CDN
 * may store them (OWASP REST Security; RFC 6749 §5.1 for token responses).
 */
function preventCaching(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

module.exports = { createApp };
