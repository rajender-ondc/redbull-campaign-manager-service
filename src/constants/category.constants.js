"use strict";

// Constants for categories (PRD S1-02, ADR-011): the business limits that the model, the validator
// and the service all read from here, so a limit is changed in one place, and the name used in
// error messages and codes.

/** Used in error messages and to build error codes, e.g. CATEGORY_NOT_FOUND. */
const CATEGORY_RESOURCE_NAME = "category";

const CATEGORY_NAME_MIN_LENGTH = 2;
const CATEGORY_NAME_MAX_LENGTH = 100;

const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 60;
/** PRD S1-02: "Seven days is the network default." Used when a category is created without a window. */
const NETWORK_DEFAULT_WINDOW_DAYS = 7;

const MAX_ALIASES_PER_CATEGORY = 50;
const ALIAS_MAX_LENGTH = 100;

module.exports = {
  CATEGORY_RESOURCE_NAME,
  CATEGORY_NAME_MIN_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  MIN_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  NETWORK_DEFAULT_WINDOW_DAYS,
  MAX_ALIASES_PER_CATEGORY,
  ALIAS_MAX_LENGTH,
};
