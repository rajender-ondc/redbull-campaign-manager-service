"use strict";

const mongoose = require("mongoose");
const { Channel } = require("../models/channel.model");
const { createNameTakenError } = require("../errors/ApiError");
const { CHANNEL_RESOURCE_NAME } = require("../constants/channel.constants");
const {
  transformToResource,
  isDuplicateKeyError,
  buildContainsPattern,
  getDocumentPage,
  updateVersionedDocument,
  deleteVersionedDocument,
} = require("../utils/mongo");

/** Channels are listed by name, ignoring letter case. */
const LIST_ORDER = { name: 1 };

/**
 * Creates a channel. The id, version and timestamps are set by the database layer.
 * @param {{ name: string }} channelInput
 */
async function create(channelInput) {
  try {
    const doc = await Channel.create(channelInput);
    return transformToResource(doc.toObject());
  } catch (err) {
    throw transformToConflictError(err, channelInput);
  }
}

/** @returns {Promise<object|null>} The channel, or null if no channel has this id. */
async function getById(id) {
  return transformToResource(await Channel.findById(id).lean());
}

/**
 * Gets one page of channels, sorted by name ignoring letter case, plus the total count.
 * With `search`, only the channels whose name contains that text are listed and counted.
 * @param {{ page: number, limit: number, search?: string }} listRequest
 */
async function getPage({ page, limit, search }) {
  const filter = search ? { name: buildContainsPattern(search) } : {};
  return getDocumentPage(Channel, { page, limit, sort: LIST_ORDER, filter });
}

/**
 * Applies `changes` and increases currentVersionNo by 1, in one atomic operation.
 * If `expectedVersion` is given, the update only happens while the stored version still equals it.
 *
 * @returns {Promise<object|null>} The updated channel, or null if nothing matched
 *   (no such channel, or its version has changed).
 */
async function updateById(id, changes, expectedVersion) {
  try {
    return await updateVersionedDocument(Channel, id, changes, expectedVersion);
  } catch (err) {
    throw transformToConflictError(err, changes);
  }
}

/**
 * Deletes the channel. Like updateById, `expectedVersion` (if given) must still match.
 * @returns {Promise<boolean>} true if a channel was deleted.
 */
async function deleteById(id, expectedVersion) {
  return deleteVersionedDocument(Channel, id, expectedVersion);
}

/**
 * True if any campaign has an affiliate running on this channel, through
 * `campaigns.affiliates[].channelIds` (docs/data_model-S1). Campaigns don't have a model yet
 * (the campaigns task adds one), so this reads the collection directly.
 */
async function isInUse(id) {
  const campaign = await mongoose.connection
    .collection("campaigns")
    .findOne(
      { "affiliates.channelIds": new mongoose.mongo.UUID(id) },
      { projection: { _id: 1 } },
    );
  return campaign !== null;
}

/** Turns a unique-index violation into a 409 the client can act on; other errors pass through unchanged. */
function transformToConflictError(err, channelInput) {
  if (isDuplicateKeyError(err) && err.keyPattern?.name) {
    return createNameTakenError(CHANNEL_RESOURCE_NAME, channelInput.name);
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
