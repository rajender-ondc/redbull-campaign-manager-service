"use strict";

// Constants for channels (ADR-013): the business limits that the model and the validator both read
// from here, and the name used in error messages and codes.

/** Used in error messages and to build error codes, e.g. CHANNEL_NOT_FOUND. */
const CHANNEL_RESOURCE_NAME = "channel";

/** 1, not 2 as for categories: "X" is a real channel. */
const CHANNEL_NAME_MIN_LENGTH = 1;
const CHANNEL_NAME_MAX_LENGTH = 50;

module.exports = {
  CHANNEL_RESOURCE_NAME,
  CHANNEL_NAME_MIN_LENGTH,
  CHANNEL_NAME_MAX_LENGTH,
};
