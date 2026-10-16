"use strict";

const express = require("express");
const userController = require("../controllers/user.controller");
const userValidator = require("../validators/user.validator");
const { validate } = require("../middlewares/validate");
const { authorize } = require("../middlewares/authorize");
const {
  createMethodNotAllowedHandler,
} = require("../middlewares/errorHandler");
const { USER_ROLE } = require("../constants/user.constants");

// Mounted at /api/v1/users by routes/index.js, behind authenticate. Every signed-in user can read
// their own profile and change their own password; managing users is for admins (ADR-015).
// Users are never deleted, so there's no DELETE: an admin disables them instead.
const router = express.Router();
const allowAdminsOnly = authorize(USER_ROLE.ADMIN);

// "/me" comes before "/:id", so "me" is never read as a user id.
router
  .route("/me")
  .get(userController.handleGetCurrentUser)
  .all(createMethodNotAllowedHandler(["GET"]));

router
  .route("/me/password")
  .put(
    validate(userValidator.changePasswordRequestSchema),
    userController.handleChangeOwnPassword,
  )
  .all(createMethodNotAllowedHandler(["PUT"]));

router
  .route("/")
  .get(
    allowAdminsOnly,
    validate(userValidator.getUsersRequestSchema),
    userController.handleGetUsers,
  )
  .post(
    allowAdminsOnly,
    validate(userValidator.createUserRequestSchema),
    userController.handleCreateUser,
  )
  .all(createMethodNotAllowedHandler(["GET", "POST"]));

router
  .route("/:id")
  .get(
    allowAdminsOnly,
    validate(userValidator.getUserRequestSchema),
    userController.handleGetUser,
  )
  .patch(
    allowAdminsOnly,
    validate(userValidator.updateUserRequestSchema),
    userController.handleUpdateUser,
  )
  .all(createMethodNotAllowedHandler(["GET", "PATCH"]));

module.exports = router;
