"use strict";

const express = require("express");
const channelController = require("../controllers/channel.controller");
const channelValidator = require("../validators/channel.validator");
const { validate } = require("../middlewares/validate");
const { authorize } = require("../middlewares/authorize");
const {
  createMethodNotAllowedHandler,
} = require("../middlewares/errorHandler");
const { USER_ROLE } = require("../constants/user.constants");

// Mounted at /api/v1/channels by routes/index.js. Each route: validate the input, then call the controller.
const router = express.Router();
// Every signed-in user can read; only admins can create, change or delete (PRD S5-01, ADR-015).
const allowAdminsOnly = authorize(USER_ROLE.ADMIN);

router
  .route("/")
  .get(
    validate(channelValidator.getChannelsRequestSchema),
    channelController.handleGetChannels,
  )
  .post(
    allowAdminsOnly,
    validate(channelValidator.createChannelRequestSchema),
    channelController.handleCreateChannel,
  )
  .all(createMethodNotAllowedHandler(["GET", "POST"]));

router
  .route("/:id")
  .get(
    validate(channelValidator.getChannelRequestSchema),
    channelController.handleGetChannel,
  )
  .patch(
    allowAdminsOnly,
    validate(channelValidator.updateChannelRequestSchema),
    channelController.handleUpdateChannel,
  )
  .delete(
    allowAdminsOnly,
    validate(channelValidator.deleteChannelRequestSchema),
    channelController.handleDeleteChannel,
  )
  .all(createMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]));

module.exports = router;
