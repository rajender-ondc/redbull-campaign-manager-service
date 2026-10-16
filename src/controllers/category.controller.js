"use strict";

const categoryService = require("../services/category.service");
const { sendCreated, sendResource, sendPage } = require("../utils/response");

// Controllers only translate HTTP to service calls and back. Input was already validated and
// cleaned by the validate() middleware (see routes), and errors go to the central error handler.

async function handleCreateCategory(req, res) {
  const category = await categoryService.createCategory(
    req.validatedInput.body,
  );
  sendCreated(req, res, category);
}

async function handleGetCategories(req, res) {
  const pageRequest = req.validatedInput.query;
  const categoryPage = await categoryService.getCategories(pageRequest);
  sendPage(res, categoryPage, pageRequest);
}

async function handleGetCategory(req, res) {
  const category = await categoryService.getCategory(
    req.validatedInput.params.id,
  );
  sendResource(res, category);
}

async function handleUpdateCategory(req, res) {
  const { params, headers, body } = req.validatedInput;
  const category = await categoryService.updateCategory(
    params.id,
    body,
    headers.expectedVersion,
  );
  sendResource(res, category);
}

async function handleDeleteCategory(req, res) {
  const { params, headers } = req.validatedInput;
  await categoryService.deleteCategory(params.id, headers.expectedVersion);
  res.status(204).end();
}

module.exports = {
  handleCreateCategory,
  handleGetCategories,
  handleGetCategory,
  handleUpdateCategory,
  handleDeleteCategory,
};
