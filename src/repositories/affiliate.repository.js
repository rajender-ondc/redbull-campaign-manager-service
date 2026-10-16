"use strict";

const mongoose = require("mongoose");
const { Affiliate } = require("../models/affiliate.model");
const { ApiError, createNameTakenError } = require("../errors/ApiError");
const { AFFILIATE_RESOURCE_NAME } = require("../constants/affiliate.constants");
const {
  transformToResource,
  isDuplicateKeyError,
  buildContainsPattern,
  getDocumentPage,
  updateVersionedDocument,
  deleteVersionedDocument,
} = require("../utils/mongo");

/** Affiliates are listed by name, ignoring letter case. */
const LIST_ORDER = { name: 1 };

/** A generated code that's already taken. The service then tries a new code; clients never see it. */
const CODE_TAKEN_ERROR_CODE = "AFFILIATE_CODE_TAKEN";

/**
 * Creates an affiliate. The id, version and timestamps are set by the database layer.
 * @param {{ code: string, name: string, contactEmail: string|null, defaultCommissionRatePercent: number,
 *           defaultContractWindowDays: number, status: string }} affiliateInput
 */
async function create(affiliateInput) {
  try {
    const doc = await Affiliate.create(affiliateInput);
    return transformToResource(doc.toObject());
  } catch (err) {
    throw transformToConflictError(err, affiliateInput);
  }
}

/** @returns {Promise<object|null>} The affiliate, or null if no affiliate has this id. */
async function getById(id) {
  return transformToResource(await Affiliate.findById(id).lean());
}

/**
 * Gets one page of affiliates, sorted by name ignoring letter case, plus the total count.
 * With `search`, only the affiliates whose name contains that text; with `status`, only those
 * with that status. Both can be combined.
 * @param {{ page: number, limit: number, search?: string, status?: string }} listRequest
 */
async function getPage({ page, limit, search, status }) {
  const filter = {};
  if (search) {
    filter.name = buildContainsPattern(search);
  }
  if (status) {
    filter.status = status;
  }
  return getDocumentPage(Affiliate, { page, limit, sort: LIST_ORDER, filter });
}

/**
 * Applies `changes` and increases currentVersionNo by 1, in one atomic operation.
 * If `expectedVersion` is given, the update only happens while the stored version still equals it.
 *
 * @returns {Promise<object|null>} The updated affiliate, or null if nothing matched
 *   (no such affiliate, or its version has changed).
 */
async function updateById(id, changes, expectedVersion) {
  try {
    return await updateVersionedDocument(
      Affiliate,
      id,
      changes,
      expectedVersion,
    );
  } catch (err) {
    throw transformToConflictError(err, changes);
  }
}

/**
 * Deletes the affiliate. Like updateById, `expectedVersion` (if given) must still match.
 * @returns {Promise<boolean>} true if an affiliate was deleted.
 */
async function deleteById(id, expectedVersion) {
  return deleteVersionedDocument(Affiliate, id, expectedVersion);
}

/**
 * True if any campaign has this affiliate, through `campaigns.affiliates[].affiliateId`
 * (docs/data_model-S1). Campaigns don't have a model yet (the campaigns task adds one), so this
 * reads the collection directly.
 */
async function isInUse(id) {
  const campaign = await mongoose.connection
    .collection("campaigns")
    .findOne(
      { "affiliates.affiliateId": new mongoose.mongo.UUID(id) },
      { projection: { _id: 1 } },
    );
  return campaign !== null;
}

/** True if creating failed only because the generated code is already taken. */
function isCodeTakenError(err) {
  return err instanceof ApiError && err.code === CODE_TAKEN_ERROR_CODE;
}

/** Turns a unique-index violation into a 409 the client can act on; other errors pass through unchanged. */
function transformToConflictError(err, affiliateInput) {
  if (!isDuplicateKeyError(err)) {
    return err;
  }
  if (err.keyPattern?.name) {
    return createNameTakenError(AFFILIATE_RESOURCE_NAME, affiliateInput.name);
  }
  if (err.keyPattern?.code) {
    return new ApiError(
      409,
      CODE_TAKEN_ERROR_CODE,
      `The code "${affiliateInput.code}" is already taken.`,
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
  isCodeTakenError,
};
