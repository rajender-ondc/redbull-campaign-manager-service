"use strict";

const { z } = require("zod");
const {
  CATEGORY_NAME_MIN_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  MIN_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
  MAX_ALIASES_PER_CATEGORY,
  ALIAS_MAX_LENGTH,
} = require("../constants/category.constants");
const {
  idParamsSchema,
  ifMatchHeadersSchema,
  paginationQuerySchema,
  buildNameSchema,
  buildCreateBodySchema,
  buildUpdateBodySchema,
} = require("../utils/validation");

const WINDOW_MESSAGE = `Must be a whole number from ${MIN_WINDOW_DAYS} to ${MAX_WINDOW_DAYS}.`;

const nameSchema = buildNameSchema({
  minLength: CATEGORY_NAME_MIN_LENGTH,
  maxLength: CATEGORY_NAME_MAX_LENGTH,
});

const defaultWindowDaysSchema = z
  .number({ error: WINDOW_MESSAGE })
  .int({ error: WINDOW_MESSAGE })
  .min(MIN_WINDOW_DAYS, { error: WINDOW_MESSAGE })
  .max(MAX_WINDOW_DAYS, { error: WINDOW_MESSAGE });

// Aliases are matching keys, not display text: stored trimmed, with repeated spaces collapsed, in
// lowercase, without duplicates, so "Dry  Fruits" and "dry fruits" are the same alias (ADR-011).
const aliasSchema = z
  .string({ error: "Each alias must be a string." })
  .trim()
  .overwrite((value) => value.replace(/\s+/g, " "))
  .toLowerCase()
  .min(1, { error: "Aliases must not be empty." })
  .max(ALIAS_MAX_LENGTH, {
    error: `Each alias must be at most ${ALIAS_MAX_LENGTH} characters.`,
  });

const aliasesSchema = z
  .array(aliasSchema, { error: "Must be a list of strings." })
  .max(MAX_ALIASES_PER_CATEGORY, {
    error: `At most ${MAX_ALIASES_PER_CATEGORY} aliases.`,
  })
  .transform((aliases) => [...new Set(aliases)]);

const createCategoryRequestSchema = {
  body: buildCreateBodySchema({
    name: nameSchema,
    defaultWindowDays: defaultWindowDaysSchema.optional(),
    aliases: aliasesSchema.optional(),
  }),
};

const getCategoriesRequestSchema = { query: paginationQuerySchema };

const getCategoryRequestSchema = { params: idParamsSchema };

const updateCategoryRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
  body: buildUpdateBodySchema({
    name: nameSchema,
    defaultWindowDays: defaultWindowDaysSchema,
    aliases: aliasesSchema,
  }),
};

const deleteCategoryRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
};

module.exports = {
  createCategoryRequestSchema,
  getCategoriesRequestSchema,
  getCategoryRequestSchema,
  updateCategoryRequestSchema,
  deleteCategoryRequestSchema,
};
