"use strict";

/**
 * @file Routes for logging in, logging out and forgot password, mounted at /api/v1/auth by
 * routes/index.js. Logging in and forgot password need no token (ADR-015). Logging out needs the
 * token it ends, so that route runs the authenticate middleware itself (ADR-016).
 */

const express = require("express");
const authController = require("../controllers/auth.controller");
const authValidator = require("../validators/auth.validator");
const { validate } = require("../middlewares/validate");
const { authenticate } = require("../middlewares/authenticate");
const {
  createMethodNotAllowedHandler,
} = require("../middlewares/errorHandler");

const router = express.Router();

router
  .route("/login")
  .post(validate(authValidator.loginRequestSchema), authController.handleLogin)
  .all(createMethodNotAllowedHandler(["POST"]));

// Any signed-in user, whatever their role, can log out.
router
  .route("/logout")
  .post(authenticate, authController.handleLogout)
  .all(createMethodNotAllowedHandler(["POST"]));

router
  .route("/forgot-password")
  .post(
    validate(authValidator.forgotPasswordRequestSchema),
    authController.handleForgotPassword,
  )
  .all(createMethodNotAllowedHandler(["POST"]));

module.exports = router;
