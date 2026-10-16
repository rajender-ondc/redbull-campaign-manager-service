"use strict";

const mongoose = require("mongoose");
const { Category } = require("../models/category.model");
const { ApiError, createNameTakenError } = require("../errors/ApiError");
const { CATEGORY_RESOURCE_NAME } = require("../constants/category.constants");
const {
  transformToResource,
  isDuplicateKeyError,
  getDocumentPage,
  updateVersionedDocument,
  deleteVersionedDocument,
} = require("../utils/mongo");

/** Categories are listed by name, ignoring letter case. */
const LIST_ORDER = { name: 1 };

/**
 * Creates a category. The id, version and timestamps are set by the database layer.
 * @param {{ name: string, defaultWindowDays: number, aliases: string[] }} categoryInput
 */
async function create(categoryInput) {
  try {
    const doc = await Category.create(categoryInput);
    return transformToResource(doc.toObject());
  } catch (err) {
    throw transformToConflictError(err, categoryInput);
  }
}

/** @returns {Promise<object|null>} The category, or null if no category has this id. */
async function getById(id) {
  return transformToResource(await Category.findById(id).lean());
}

/** Gets one page of categories, sorted by name ignoring letter case, plus the total count. */
async function getPage({ page, limit }) {
  return getDocumentPage(Category, { page, limit, sort: LIST_ORDER });
}

/**
 * Applies `changes` and increases currentVersionNo by 1, in one atomic operation.
 * If `expectedVersion` is given, the update only happens while the stored version still equals it.
 *
 * @returns {Promise<object|null>} The updated category, or null if nothing matched
 *   (no such category, or its version has changed).
 */
async function updateById(id, changes, expectedVersion) {
  try {
    return await updateVersionedDocument(
      Category,
      id,
      changes,
      expectedVersion,
    );
  } catch (err) {
    throw transformToConflictError(err, changes);
  }
}

/**
 * Deletes the category. Like updateById, `expectedVersion` (if given) must still match.
 * @returns {Promise<boolean>} true if a category was deleted.
 */
async function deleteById(id, expectedVersion) {
  return deleteVersionedDocument(Category, id, expectedVersion);
}

/**
 * True if any campaign points at this category, through `campaigns.categoryId` (docs/data_model-S1).
 * Campaigns don't have a model yet (the campaigns task adds one), so this reads the collection directly.
 */
async function isInUse(id) {
  const campaign = await mongoose.connection
    .collection("campaigns")
    .findOne(
      { categoryId: new mongoose.mongo.UUID(id) },
      { projection: { _id: 1 } },
    );
  return campaign !== null;
}

/** Turns a unique-index violation into a 409 the client can act on; other errors pass through unchanged. */
function transformToConflictError(err, categoryInput) {
  if (!isDuplicateKeyError(err)) {
    return err;
  }
  if (err.keyPattern?.name) {
    return createNameTakenError(CATEGORY_RESOURCE_NAME, categoryInput.name);
  }
  if (err.keyPattern?.aliases) {
    return new ApiError(
      409,
      "CATEGORY_ALIAS_TAKEN",
      `The alias "${err.keyValue.aliases}" already belongs to another category.`,
    );
  }
  return err;
}

module.exports = {
  create,
  getById,
  getPage,
  updateById,
  deleteById,
  isInUse,
};
