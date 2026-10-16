"use strict";

const channelService = require("../services/channel.service");
const { sendCreated, sendResource, sendPage } = require("../utils/response");

// Controllers only translate HTTP to service calls and back. Input was already validated and
// cleaned by the validate() middleware (see routes), and errors go to the central error handler.

async function handleCreateChannel(req, res) {
  const channel = await channelService.createChannel(req.validatedInput.body);
  sendCreated(req, res, channel);
}

async function handleGetChannels(req, res) {
  const listRequest = req.validatedInput.query;
  const channelPage = await channelService.getChannels(listRequest);
  sendPage(res, channelPage, listRequest);
}

async function handleGetChannel(req, res) {
  const channel = await channelService.getChannel(req.validatedInput.params.id);
  sendResource(res, channel);
}

async function handleUpdateChannel(req, res) {
  const { params, headers, body } = req.validatedInput;
  const channel = await channelService.updateChannel(
    params.id,
    body,
    headers.expectedVersion,
  );
  sendResource(res, channel);
}

async function handleDeleteChannel(req, res) {
  const { params, headers } = req.validatedInput;
  await channelService.deleteChannel(params.id, headers.expectedVersion);
  res.status(204).end();
}

module.exports = {
  handleCreateChannel,
  handleGetChannels,
  handleGetChannel,
  handleUpdateChannel,
  handleDeleteChannel,
};
