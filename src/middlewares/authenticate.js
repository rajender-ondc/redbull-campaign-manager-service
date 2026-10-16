"use strict";

/**
 * @file The authenticate middleware (ADR-015, ADR-016): lets a request through only with a valid
 * login token.
 */

const tokenService = require("../services/token.service");
const authService = require("../services/auth.service");
const { ApiError } = require("../errors/ApiError");

/** "Authorization: Bearer <token>"; the scheme name isn't case-sensitive (RFC 7235). */
const BEARER_TOKEN_PATTERN = /^Bearer\s+(\S+)$/i;
const AUTHENTICATION_REQUIRED_HEADERS = {
  "WWW-Authenticate": 'Bearer realm="redbull-api"',
};
const INVALID_TOKEN_HEADERS = {
  "WWW-Authenticate": 'Bearer realm="redbull-api", error="invalid_token"',
};

/**
 * Lets a request through only with a valid login token:
 * - the token must be signed by S1 (RS256), unexpired, and for this issuer and audience;
 * - it must not have been logged out;
 * - its user must still be active, and it must be newer than the user's last password change.
 *
 * For the rest of the request it sets:
 * - `req.user`: `{ id, role, name }`, the signed-in user;
 * - `req.accessToken`: `{ id, expiresAt }`, the token's id (`jti`) and expiry, which logout uses.
 *
 * @param {import("express").Request} req - The incoming request.
 * @param {import("express").Response} _res - Not used.
 * @param {import("express").NextFunction} next - Passes the request on.
 * @returns {Promise<void>}
 * @throws {ApiError} 401 `AUTHENTICATION_REQUIRED` when no token is sent; 401 `INVALID_TOKEN`
 *   when the token is refused.
 */
async function authenticate(req, _res, next) {
  const token = req.get("Authorization")?.match(BEARER_TOKEN_PATTERN)?.[1];
  if (!token) {
    throw new ApiError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Log in, then send the token as Authorization: Bearer <token>.",
      undefined,
      AUTHENTICATION_REQUIRED_HEADERS,
    );
  }
  const claims = getVerifiedClaims(token);
  const tokenUser = claims ? await authService.getTokenUser(claims) : null;
  if (!tokenUser) {
    throw new ApiError(
      401,
      "INVALID_TOKEN",
      "The token is invalid, has expired or is no longer accepted. Log in again.",
      undefined,
      INVALID_TOKEN_HEADERS,
    );
  }
  req.user = tokenUser;
  req.accessToken = { id: claims.jti, expiresAt: new Date(claims.exp * 1000) };
  next();
}

/**
 * Checks a token's signature, expiry, issuer and audience.
 *
 * @param {string} token - The token from the Authorization header.
 * @returns {object | null} The token's claims, or null if it isn't valid: a bad signature, expired,
 *   for another issuer or audience, or not a JWT at all.
 */
function getVerifiedClaims(token) {
  try {
    return tokenService.verifyAccessToken(token);
  } catch {
    return null;
  }
}

module.exports = { authenticate };
