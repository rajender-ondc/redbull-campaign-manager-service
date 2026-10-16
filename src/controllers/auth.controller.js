"use strict";

/**
 * @file HTTP handlers for logging in, logging out and forgot password (ADR-015, ADR-016).
 * Controllers only translate HTTP to service calls and back. Input was already validated and
 * cleaned by the validate() middleware (see routes), and errors go to the central error handler.
 */

const authService = require("../services/auth.service");

/**
 * POST /auth/login: checks the email and password and returns a token.
 *
 * @param {import("express").Request} req - Its body was validated by the loginRequestSchema.
 * @param {import("express").Response} res - Answers 200 with
 *   `{ data: { accessToken, tokenType, expiresIn } }`.
 * @returns {Promise<void>}
 */
async function handleLogin(req, res) {
  const { email, password } = req.validatedInput.body;
  const { accessToken, expiresIn } = await authService.login(email, password);
  // A token must never be stored by a browser, proxy or CDN (RFC 6749 §5.1).
  res
    .set({ "Cache-Control": "no-store", Pragma: "no-cache" })
    .json({ data: { accessToken, tokenType: "Bearer", expiresIn } });
}

/**
 * POST /auth/logout: ends the session of the token this request was sent with (ADR-016).
 *
 * @param {import("express").Request} req - Passed the authenticate middleware, which set
 *   `req.user` and `req.accessToken`.
 * @param {import("express").Response} res - Answers 204 No Content.
 * @returns {Promise<void>}
 */
async function handleLogout(req, res) {
  await authService.logout(req.user.id, req.accessToken);
  res.status(204).end();
}

/**
 * POST /auth/forgot-password: sets a new password for the account with this email.
 *
 * @param {import("express").Request} req - Its body was validated by the
 *   forgotPasswordRequestSchema.
 * @param {import("express").Response} res - Answers 204 No Content.
 * @returns {Promise<void>}
 */
async function handleForgotPassword(req, res) {
  const { email, newPassword } = req.validatedInput.body;
  await authService.resetForgottenPassword(email, newPassword);
  res.status(204).end();
}

module.exports = { handleLogin, handleLogout, handleForgotPassword };
