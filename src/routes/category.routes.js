"use strict";

const express = require("express");
const categoryController = require("../controllers/category.controller");
const categoryValidator = require("../validators/category.validator");
const { validate } = require("../middlewares/validate");
const { authorize } = require("../middlewares/authorize");
const {
  createMethodNotAllowedHandler,
} = require("../middlewares/errorHandler");
const { USER_ROLE } = require("../constants/user.constants");

// Mounted at /api/v1/categories by routes/index.js. Each route: validate the input, then call the controller.
const router = express.Router();
// Every signed-in user can read; only admins can create, change or delete (PRD S5-01, ADR-015).
const allowAdminsOnly = authorize(USER_ROLE.ADMIN);

router
  .route("/")
  .get(
    validate(categoryValidator.getCategoriesRequestSchema),
    categoryController.handleGetCategories,
  )
  .post(
    allowAdminsOnly,
    validate(categoryValidator.createCategoryRequestSchema),
    categoryController.handleCreateCategory,
  )
  .all(createMethodNotAllowedHandler(["GET", "POST"]));

router
  .route("/:id")
  .get(
    validate(categoryValidator.getCategoryRequestSchema),
    categoryController.handleGetCategory,
  )
  .patch(
    allowAdminsOnly,
    validate(categoryValidator.updateCategoryRequestSchema),
    categoryController.handleUpdateCategory,
  )
  .delete(
    allowAdminsOnly,
    validate(categoryValidator.deleteCategoryRequestSchema),
    categoryController.handleDeleteCategory,
  )
  .all(createMethodNotAllowedHandler(["GET", "PATCH", "DELETE"]));

module.exports = router;
