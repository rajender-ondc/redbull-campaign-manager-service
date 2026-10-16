"use strict";

const channelRepository = require("../repositories/channel.repository");
const {
  createNotFoundError,
  createInUseError,
  createWriteFailureError,
  assertVersionMatches,
} = require("../errors/ApiError");
const { CHANNEL_RESOURCE_NAME } = require("../constants/channel.constants");

/** @param {{ name: string }} channelInput */
async function createChannel(channelInput) {
  return channelRepository.create({ name: channelInput.name });
}

async function getChannel(id) {
  const channel = await channelRepository.getById(id);
  if (!channel) {
    throw createNotFoundError(CHANNEL_RESOURCE_NAME, id);
  }
  return channel;
}

/**
 * Gets one page of channels; with `search`, only those whose name contains that text.
 * @param {{ page: number, limit: number, search?: string }} listRequest
 * @returns {Promise<{ items: object[], totalItems: number }>}
 */
async function getChannels(listRequest) {
  return channelRepository.getPage(listRequest);
}

/**
 * Renames a channel.
 * @param {string} id
 * @param {{ name: string }} changes
 * @param {number} [expectedVersion] From If-Match; the update is refused (412) if the channel changed since.
 */
async function updateChannel(id, changes, expectedVersion) {
  const updatedChannel = await channelRepository.updateById(
    id,
    changes,
    expectedVersion,
  );
  if (updatedChannel) {
    return updatedChannel;
  }
  throw createWriteFailureError(
    CHANNEL_RESOURCE_NAME,
    id,
    await channelRepository.getById(id),
    expectedVersion,
  );
}

/**
 * Permanently deletes a channel, but only while no campaign uses it (ADR-013).
 * @param {string} id
 * @param {number} [expectedVersion] From If-Match; the delete is refused (412) if the channel changed since.
 */
async function deleteChannel(id, expectedVersion) {
  const channel = await getChannel(id);
  assertVersionMatches(CHANNEL_RESOURCE_NAME, channel, expectedVersion);
  if (await channelRepository.isInUse(id)) {
    throw createInUseError(CHANNEL_RESOURCE_NAME, channel.name);
  }
  const isDeleted = await channelRepository.deleteById(id, expectedVersion);
  if (!isDeleted) {
    // Someone deleted or changed it between our checks and the delete.
    throw createWriteFailureError(
      CHANNEL_RESOURCE_NAME,
      id,
      await channelRepository.getById(id),
      expectedVersion,
    );
  }
}

module.exports = {
  createChannel,
  getChannel,
  getChannels,
  updateChannel,
  deleteChannel,
};
