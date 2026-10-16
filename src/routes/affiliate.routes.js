"use strict";

const express = require("express");
const affiliateController = require("../controllers/affiliate.controller");
const affiliateValidator = require("../validators/affiliate.validator");
const { validate } = require("../middlewares/validate");
const { authorize } = require("../middlewares/authorize");
const {
  createMethodNotAllowedHandler,
} = require("../middlewares/errorHandler");
const { USER_ROLE } = require("../constants/user.constants");

// Mounted at /api/v1/affiliates by routes/index.js. Each route: validate the input, then call the
// controller. Pause and resume are PATCH requests that change `status` (ADR-014).
const router = express.Router();
// Every signed-in user can read; only admins can create, change or delete (PRD S5-01, ADR-015).
const allowAdminsOnly = authorize(USER_ROLE.ADMIN);

router
  .route("/")
  .get(
    validate(affiliateValidator.getAffiliatesRequestSchema),
    affiliateController.handleGetAffiliates,
  )
  .post(
    allowAdminsOnly,
    validate(affiliateValidator.createAffiliateRequestSchema),
    affiliateController.handleCreateAffiliate,
  )
  .all(createMethodNotAllowedHandler(["GET", "POST"]));

router
  .route("/:id")
  .get(
    validate(affiliateValidator.getAffiliateRequestSchema),
    affiliateController.handleGetAffiliate,
  )
  .patch(
    allowAdminsOnly,
    validate(affiliateValidator.updateAffiliateRequestSchema),
    affiliateController.handleUpdateAffiliate,
  )
  .delete(
    allowAdminsOnly,
    validate(affiliateValidator.deleteAffiliateRequestSchema),
    affiliateController.handleDeleteAffiliate,
  )
  .all(createMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]));

module.exports = router;
