"use strict";

// A throwaway in-memory MongoDB for tests. Tests never read .env, so they never touch your
// configured database.

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const {
  connectDatabase,
  disconnectDatabase,
} = require("../../src/config/database");

let mongoServer;

/** Starts the in-memory MongoDB, connects with the app's own settings and builds every model's indexes. */
async function startTestDatabase() {
  mongoServer = await MongoMemoryServer.create();
  await connectDatabase(mongoServer.getUri());
  // Unique indexes must exist before tests run, or duplicate checks would pass by accident.
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
}

/** Deletes every document from every collection. Indexes are kept. */
async function clearTestDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function stopTestDatabase() {
  await disconnectDatabase();
  await mongoServer.stop();
}

module.exports = { startTestDatabase, clearTestDatabase, stopTestDatabase };
