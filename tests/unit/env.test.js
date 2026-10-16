"use strict";

// Unit tests for the start-up configuration (src/config/env.js, ADR-015). They pass plain objects
// to parseEnv, so they never read the real .env or its signing key.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { parseEnv } = require("../../src/config/env");

const PRIVATE_KEY_PEM = crypto
  .generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" });
const JWT_VARIABLE_NAMES = [
  "JWT_SECRET_KEY",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "ACCESS_TOKEN_TTL_MINUTES",
];
/** What a complete .env provides. Environment variables always arrive as text. */
const VALID_VARIABLES = Object.freeze({
  MONGODB_URI: "mongodb://127.0.0.1:27017/campaign_manager",
  JWT_SECRET_KEY: PRIVATE_KEY_PEM,
  JWT_ISSUER: "redbull-auth",
  JWT_AUDIENCE: "redbull-api",
  ACCESS_TOKEN_TTL_MINUTES: "60",
});

/** A copy of VALID_VARIABLES without the named variables. */
function buildVariablesWithout(names) {
  return Object.fromEntries(
    Object.entries(VALID_VARIABLES).filter(([name]) => !names.includes(name)),
  );
}

/** The message parseEnv fails with; the test fails if it doesn't throw. */
function getEnvErrorMessage(variables) {
  try {
    parseEnv(variables);
  } catch (err) {
    return err.message;
  }
  assert.fail("parseEnv should have refused these variables");
}

describe("parseEnv: the JWT settings in .env", () => {
  it("reads the key with real line breaks, or on one line with \\n between its lines", () => {
    const oneLineKey = PRIVATE_KEY_PEM.replaceAll("\n", "\\n");

    const multiLineEnv = parseEnv(VALID_VARIABLES);
    const oneLineEnv = parseEnv({
      ...VALID_VARIABLES,
      JWT_SECRET_KEY: oneLineKey,
    });

    assert.equal(multiLineEnv.JWT_SECRET_KEY, PRIVATE_KEY_PEM.trim());
    assert.equal(oneLineEnv.JWT_SECRET_KEY, PRIVATE_KEY_PEM.trim());
    assert.equal(oneLineEnv.JWT_ISSUER, "redbull-auth");
    assert.equal(oneLineEnv.JWT_AUDIENCE, "redbull-api");
    assert.equal(oneLineEnv.ACCESS_TOKEN_TTL_MINUTES, 60);
  });

  it("requires the key, issuer, audience and token lifetime, with no fallback values", () => {
    const message = getEnvErrorMessage(
      buildVariablesWithout(JWT_VARIABLE_NAMES),
    );

    for (const name of JWT_VARIABLE_NAMES) {
      assert.match(message, new RegExp(`${name} must be set`));
    }
  });

  it("refuses blank values, and a lifetime that isn't 5 to 1440 whole minutes", () => {
    const blankMessage = getEnvErrorMessage({
      ...VALID_VARIABLES,
      JWT_SECRET_KEY: "  ",
      JWT_ISSUER: "",
      JWT_AUDIENCE: " ",
    });

    for (const name of ["JWT_SECRET_KEY", "JWT_ISSUER", "JWT_AUDIENCE"]) {
      assert.match(blankMessage, new RegExp(`${name} must be set`));
    }
    for (const lifetime of ["4", "1441", "7.5", "sixty"]) {
      const message = getEnvErrorMessage({
        ...VALID_VARIABLES,
        ACCESS_TOKEN_TTL_MINUTES: lifetime,
      });
      assert.match(
        message,
        /ACCESS_TOKEN_TTL_MINUTES must be set to a whole number of minutes from 5 to 1440/,
      );
      // Errors name the variables, never their values, so the key can't reach a log.
      assert.doesNotMatch(message, /PRIVATE KEY|sixty/);
    }
  });
});
