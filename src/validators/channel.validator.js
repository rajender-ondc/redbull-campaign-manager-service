"use strict";

const {
  CHANNEL_NAME_MIN_LENGTH,
  CHANNEL_NAME_MAX_LENGTH,
} = require("../constants/channel.constants");
const {
  idParamsSchema,
  ifMatchHeadersSchema,
  paginationQuerySchema,
  buildNameSchema,
  buildSearchSchema,
  buildCreateBodySchema,
  buildUpdateBodySchema,
} = require("../utils/validation");

const nameSchema = buildNameSchema({
  minLength: CHANNEL_NAME_MIN_LENGTH,
  maxLength: CHANNEL_NAME_MAX_LENGTH,
});

const createChannelRequestSchema = {
  body: buildCreateBodySchema({ name: nameSchema }),
};

// `?search=` lists only the channels whose name contains this text (ADR-013).
const getChannelsRequestSchema = {
  query: paginationQuerySchema.extend({
    search: buildSearchSchema({ maxLength: CHANNEL_NAME_MAX_LENGTH }),
  }),
};

const getChannelRequestSchema = { params: idParamsSchema };

const updateChannelRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
  body: buildUpdateBodySchema({ name: nameSchema }),
};

const deleteChannelRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
};

module.exports = {
  createChannelRequestSchema,
  getChannelsRequestSchema,
  getChannelRequestSchema,
  updateChannelRequestSchema,
  deleteChannelRequestSchema,
};
