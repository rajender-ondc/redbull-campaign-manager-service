"use strict";

// Unit tests for the signing-key check that runs at start-up (src/services/token.service.js,
// ADR-015). Signing and verifying tokens are covered by the API tests.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { configureTokenIssuer } = require("../../src/services/token.service");

const SETTINGS = Object.freeze({
  issuer: "redbull-auth",
  audience: "redbull-api",
  accessTokenTtlMinutes: 60,
});
const WEAK_KEY_MESSAGE =
  "The JWT signing key must be an RSA private key of at least 2048 bits.";

/** A fresh key pair of the given type, in PEM format. */
function generateKeyPairPem(type, options) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync(type, options);
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
}

describe("configureTokenIssuer: the signing key", () => {
  it("accepts an RSA private key of 2048 bits", () => {
    const { privateKeyPem } = generateKeyPairPem("rsa", {
      modulusLength: 2048,
    });

    assert.doesNotThrow(() =>
      configureTokenIssuer({ ...SETTINGS, privateKeyPem }),
    );
  });

  it("refuses text that isn't a private key, such as a broken copy or the public key", () => {
    const { publicKeyPem } = generateKeyPairPem("rsa", { modulusLength: 2048 });
    const brokenPem =
      "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----";

    for (const privateKeyPem of [brokenPem, publicKeyPem]) {
      assert.throws(
        () => configureTokenIssuer({ ...SETTINGS, privateKeyPem }),
        (err) => {
          assert.equal(
            err.message,
            "The JWT signing key isn't a private key in PEM format.",
          );
          assert.doesNotMatch(err.message, /not-a-real-key|PUBLIC KEY/);
          return true;
        },
      );
    }
  });

  it("refuses an RSA key under 2048 bits, and a key that isn't RSA", () => {
    const weakKeyPems = [
      generateKeyPairPem("rsa", { modulusLength: 1024 }).privateKeyPem,
      generateKeyPairPem("ec", { namedCurve: "P-256" }).privateKeyPem,
    ];

    for (const privateKeyPem of weakKeyPems) {
      assert.throws(
        () => configureTokenIssuer({ ...SETTINGS, privateKeyPem }),
        {
          message: WEAK_KEY_MESSAGE,
        },
      );
    }
  });
});
