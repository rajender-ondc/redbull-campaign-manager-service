"use strict";

const userRepository = require("../repositories/user.repository");
const revokedTokenRepository = require("../repositories/revokedToken.repository");
const tokenService = require("./token.service");
const { ApiError, createNotFoundError } = require("../errors/ApiError");
const {
  hashPassword,
  isPasswordMatch,
  runDecoyPasswordCheck,
} = require("../utils/password");
const {
  USER_RESOURCE_NAME,
  USER_STATUS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_MINUTES,
} = require("../constants/user.constants");

// The authentication service (ADR-015): checks credentials, applies the lockout, and asks the token
// issuer (token.service.js) for a token. Forgot password and password changes live here too,
// because they check or replace credentials, and so does logout (ADR-016), which ends a token.

/** Every 401 we send names the scheme the client should use (RFC 7235). */
const AUTHENTICATE_HEADERS = {
  "WWW-Authenticate": 'Bearer realm="redbull-api"',
};

/**
 * Logs a user in: checks the email and password and, only if both are right, issues a token.
 * A wrong email, a wrong password and a disabled account all get the same answer.
 * @returns {Promise<{ accessToken: string, expiresIn: number }>}
 */
async function login(email, password) {
  const credentials = await userRepository.getCredentialsByEmail(email);
  if (!credentials || credentials.user.status !== USER_STATUS.ACTIVE) {
    // Take as long as a real check, so response times don't reveal which accounts exist.
    await runDecoyPasswordCheck(password);
    throw createInvalidCredentialsError();
  }
  const { user, passwordHash } = credentials;
  if (!(await isCorrectPassword(user, password, passwordHash))) {
    throw createInvalidCredentialsError();
  }
  await userRepository.recordSuccessfulLogin(user.id, new Date());
  return tokenService.issueAccessToken(user);
}

/**
 * Sets a new password for the active account with this email ("forgot password"). It also clears a
 * lockout, and tokens issued before it stop working in S1.
 *
 * ⚠ Accepted risk (ADR-015): there's no verification yet, so anyone who knows the email can do
 * this. It must get an emailed link or code before production.
 */
async function resetForgottenPassword(email, newPassword) {
  const user = await userRepository.getByEmail(email);
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    throw new ApiError(
      404,
      "USER_NOT_FOUND",
      "No active account uses this email.",
    );
  }
  await userRepository.setPassword(
    user.id,
    await hashPassword(newPassword),
    new Date(),
  );
}

/**
 * Changes a signed-in user's own password after checking the current one; a wrong current password
 * counts towards the lockout. Tokens issued before the change stop working, so the user logs in again.
 */
async function changePassword(userId, currentPassword, newPassword) {
  const credentials = await userRepository.getCredentialsById(userId);
  if (!credentials) {
    throw createNotFoundError(USER_RESOURCE_NAME, userId);
  }
  const { user, passwordHash } = credentials;
  if (!(await isCorrectPassword(user, currentPassword, passwordHash))) {
    throw new ApiError(400, "VALIDATION_FAILED", "1 invalid field.", [
      {
        field: "currentPassword",
        message: "Doesn't match your current password.",
      },
    ]);
  }
  await userRepository.setPassword(
    userId,
    await hashPassword(newPassword),
    new Date(),
  );
}

/**
 * Logs out one session: S1 refuses this token from now on, while the user's other tokens keep
 * working (ADR-016). The record is kept only until the token would have expired anyway.
 *
 * @param {string} userId - The signed-in user's id.
 * @param {{ id: string, expiresAt: Date }} accessToken - The token being logged out: its id
 *   (`jti`) and when it expires.
 * @returns {Promise<void>}
 */
async function logout(userId, accessToken) {
  await revokedTokenRepository.create({
    tokenId: accessToken.id,
    userId,
    expiresAt: accessToken.expiresAt,
  });
}

/**
 * Finds the signed-in user behind a verified token. The token is refused when:
 * - it has no id (`jti`), so it couldn't be logged out (S1 always gives its tokens one);
 * - it was logged out (ADR-016);
 * - its user no longer exists or is disabled;
 * - it was issued before the user's last password change.
 *
 * The role comes from the database, so a demoted admin loses admin rights at once.
 *
 * @param {{ sub: string, jti?: string, iat: number }} claims - The claims of a token that
 *   tokenService.verifyAccessToken accepted.
 * @returns {Promise<{ id: string, role: string, name: string } | null>} The user, or null if the
 *   token must be refused.
 */
async function getTokenUser(claims) {
  if (typeof claims.jti !== "string") {
    return null;
  }
  const [user, isLoggedOut] = await Promise.all([
    userRepository.getById(claims.sub),
    revokedTokenRepository.isRevoked(claims.jti),
  ]);
  if (isLoggedOut || !user || user.status !== USER_STATUS.ACTIVE) {
    return null;
  }
  // `iat` is in whole seconds, so the comparison is too.
  const passwordChangedAtSeconds = Math.floor(
    new Date(user.passwordChangedAt).getTime() / 1000,
  );
  if (claims.iat < passwordChangedAtSeconds) {
    return null;
  }
  return { id: user.id, role: user.role, name: user.name };
}

/**
 * Checks a password while applying the lockout. A locked account is refused (423) without checking.
 * A wrong password is counted, and the 5th in a row locks the account for 15 minutes (423).
 * @returns {Promise<boolean>} true if the password is right.
 */
async function isCorrectPassword(user, password, passwordHash) {
  assertNotLocked(user);
  if (await isPasswordMatch(password, passwordHash)) {
    return true;
  }
  const failedAttempts = await userRepository.recordFailedLogin(user.id);
  if (failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    await userRepository.lockAccount(user.id, lockedUntil);
    throw createAccountLockedError(lockedUntil);
  }
  return false;
}

function assertNotLocked(user) {
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw createAccountLockedError(new Date(user.lockedUntil));
  }
}

function createInvalidCredentialsError() {
  return new ApiError(
    401,
    "INVALID_CREDENTIALS",
    "The email or password is incorrect.",
    undefined,
    AUTHENTICATE_HEADERS,
  );
}

function createAccountLockedError(lockedUntil) {
  const secondsLeft = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
  );
  return new ApiError(
    423,
    "ACCOUNT_LOCKED",
    `Too many wrong passwords. Try again in ${Math.ceil(secondsLeft / 60)} minutes.`,
    undefined,
    { "Retry-After": String(secondsLeft) },
  );
}

module.exports = {
  login,
  logout,
  resetForgottenPassword,
  changePassword,
  getTokenUser,
};
