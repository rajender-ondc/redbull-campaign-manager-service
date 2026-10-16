"use strict";

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

// The token issuer (ADR-015): signs login tokens with S1's private key and verifies them with the
// matching public key. It knows nothing about passwords, users' records or configuration.

/** RS256 only: verifying with an explicit list blocks "alg: none" and algorithm-swap tricks. */
const SIGNING_ALGORITHM = "RS256";
const MIN_RSA_KEY_BITS = 2048;

/** Keys and settings, set once at start-up by configureTokenIssuer(). */
let issuerSettings = null;

/**
 * Sets up the issuer at start-up (server.js, tests). Fails if the key isn't an RSA private key of
 * at least 2048 bits in PEM format. The public key is derived from the private one.
 * @param {{ privateKeyPem: string, issuer: string, audience: string, accessTokenTtlMinutes: number }} settings
 */
function configureTokenIssuer({
  privateKeyPem,
  issuer,
  audience,
  accessTokenTtlMinutes,
}) {
  const privateKey = parsePrivateKey(privateKeyPem);
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    privateKey.asymmetricKeyDetails.modulusLength < MIN_RSA_KEY_BITS
  ) {
    throw new Error(
      `The JWT signing key must be an RSA private key of at least ${MIN_RSA_KEY_BITS} bits.`,
    );
  }
  const publicKey = crypto.createPublicKey(privateKey);
  issuerSettings = Object.freeze({
    privateKey,
    publicKey,
    keyId: computeKeyId(publicKey),
    issuer,
    audience,
    accessTokenTtlSeconds: accessTokenTtlMinutes * 60,
  });
}

/**
 * Issues a signed access token for a user whose password was just checked.
 * The token holds no personal data: only the user id (`sub`) and role.
 * @param {{ id: string, role: string }} user
 * @returns {{ accessToken: string, expiresIn: number }} expiresIn is in seconds.
 */
function issueAccessToken(user) {
  const settings = getIssuerSettings();
  const accessToken = jwt.sign({ role: user.role }, settings.privateKey, {
    algorithm: SIGNING_ALGORITHM,
    keyid: settings.keyId,
    issuer: settings.issuer,
    audience: settings.audience,
    subject: user.id,
    expiresIn: settings.accessTokenTtlSeconds,
    jwtid: crypto.randomUUID(),
  });
  return { accessToken, expiresIn: settings.accessTokenTtlSeconds };
}

/**
 * Checks a token's signature (with the public key), expiry, issuer and audience.
 * @returns {{ sub: string, role: string, iat: number, exp: number, jti: string }} The token's claims.
 * @throws {jwt.JsonWebTokenError} If the token isn't valid (TokenExpiredError when it has expired).
 */
function verifyAccessToken(token) {
  const settings = getIssuerSettings();
  return jwt.verify(token, settings.publicKey, {
    algorithms: [SIGNING_ALGORITHM],
    issuer: settings.issuer,
    audience: settings.audience,
  });
}

/** Reads the PEM key. Neither the error nor its cause ever contains the key itself. */
function parsePrivateKey(privateKeyPem) {
  try {
    return crypto.createPrivateKey(privateKeyPem);
  } catch (err) {
    throw new Error("The JWT signing key isn't a private key in PEM format.", {
      cause: err,
    });
  }
}

function getIssuerSettings() {
  if (!issuerSettings) {
    throw new Error(
      "The token issuer isn't configured; call configureTokenIssuer() at start-up.",
    );
  }
  return issuerSettings;
}

/** The key id (`kid`): the RFC 7638 thumbprint of the public key, so it changes when the key changes. */
function computeKeyId(publicKey) {
  const { e, kty, n } = publicKey.export({ format: "jwk" });
  // RFC 7638: the required members in alphabetical order, without whitespace.
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ e, kty, n }))
    .digest("base64url");
}

module.exports = { configureTokenIssuer, issueAccessToken, verifyAccessToken };
