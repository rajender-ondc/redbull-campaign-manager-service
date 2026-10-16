"use strict";

// Login helpers for API tests (ADR-015): a throwaway RSA key pair, generated once per test file,
// and users created straight in the database with a ready-made token. Tests never read .env, so
// they never use the real signing key (JWT_SECRET_KEY).

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const {
  configureTokenIssuer,
  issueAccessToken,
} = require("../../src/services/token.service");
const { User } = require("../../src/models/user.model");

const TEST_ISSUER = "redbull-auth";
const TEST_AUDIENCE = "redbull-api";
/** Meets the password rules. Test users store it with a cheap bcrypt cost, so tests stay fast. */
const TEST_PASSWORD = "Admin@1234";
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

configureTokenIssuer({
  privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  accessTokenTtlMinutes: 60,
});

/**
 * Creates a user straight in the database and returns it with a ready-made Authorization header.
 * @param {{ role?: string, email?: string, name?: string, status?: string }} [userInput]
 */
async function createTestUser({
  role = "admin",
  email,
  name,
  status = "active",
} = {}) {
  const user = await User.create({
    email: email ?? `${role}.${crypto.randomUUID()}@ondc.org`,
    name: name ?? `Test ${role}`,
    role,
    status,
    passwordHash: TEST_PASSWORD_HASH,
    // A minute ago, so tokens issued now are newer than the last password change.
    passwordChangedAt: new Date(Date.now() - 60_000),
  });
  const { accessToken } = issueAccessToken({ id: user.id, role });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    authorization: `Bearer ${accessToken}`,
  };
}

/** Signs a token with the test key (or `key`), for tests that need a crafted or broken token. */
function signTestToken(claims, { key = privateKey, ...options } = {}) {
  return jwt.sign(claims, key, {
    algorithm: "RS256",
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    expiresIn: 3600,
    ...options,
  });
}

/**
 * Wraps supertest so every request carries the Authorization header that `getAuthorization`
 * returns at call time (suites create a fresh admin before each test).
 */
function createAuthorizedApi(app, getAuthorization) {
  const sendWithAuthorization = (method) => (url) =>
    request(app)[method](url).set("Authorization", getAuthorization());
  return {
    get: sendWithAuthorization("get"),
    post: sendWithAuthorization("post"),
    put: sendWithAuthorization("put"),
    patch: sendWithAuthorization("patch"),
    delete: sendWithAuthorization("delete"),
  };
}

module.exports = {
  TEST_PASSWORD,
  publicKey,
  createTestUser,
  signTestToken,
  createAuthorizedApi,
};
