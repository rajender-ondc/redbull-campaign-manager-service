"use strict";

const mongoose = require("mongoose");

/** How long to wait for MongoDB before a connection or query fails, instead of hanging. */
const SERVER_SELECTION_TIMEOUT_MS = 5_000;

/**
 * Connects Mongoose to MongoDB. Start-up and the tests both use this, so they run with the
 * same settings.
 *
 * @param {string} uri MongoDB connection string, e.g. mongodb://127.0.0.1:27017/campaign_manager
 * @returns {Promise<{ host: string, port: number, name: string }>} Where it connected (never the credentials).
 */
async function connectDatabase(uri) {
  mongoose.set("sanitizeFilter", true); // second guard against query-operator injection
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });
  const { host, port, name } = mongoose.connection;
  return { host, port, name };
}

/** Closes the MongoDB connection (graceful shutdown and tests). */
async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
