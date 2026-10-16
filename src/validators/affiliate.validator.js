"use strict";

const { z } = require("zod");
const {
  AFFILIATE_NAME_MIN_LENGTH,
  AFFILIATE_NAME_MAX_LENGTH,
  CONTACT_EMAIL_MAX_LENGTH,
  MAX_COMMISSION_RATE_PERCENT,
  COMMISSION_RATE_STEP,
  MIN_CONTRACT_WINDOW_DAYS,
  MAX_CONTRACT_WINDOW_DAYS,
  AFFILIATE_STATUSES,
} = require("../constants/affiliate.constants");
const {
  idParamsSchema,
  ifMatchHeadersSchema,
  paginationQuerySchema,
  buildNameSchema,
  buildSearchSchema,
  buildCreateBodySchema,
  buildUpdateBodySchema,
} = require("../utils/validation");

const RATE_MESSAGE = `Must be a number above 0 and at most ${MAX_COMMISSION_RATE_PERCENT}, with up to 2 decimals.`;
const WINDOW_MESSAGE = `Must be a whole number from ${MIN_CONTRACT_WINDOW_DAYS} to ${MAX_CONTRACT_WINDOW_DAYS}.`;
const STATUS_MESSAGE = `Must be ${AFFILIATE_STATUSES.join(" or ")}.`;
const EMAIL_MESSAGE = "Must be a valid email address.";

const nameSchema = buildNameSchema({
  minLength: AFFILIATE_NAME_MIN_LENGTH,
  maxLength: AFFILIATE_NAME_MAX_LENGTH,
});

// Optional, stored trimmed and lowercase. A blank value or null means "no email" (and removes it).
const contactEmailSchema = z
  .string({ error: `${EMAIL_MESSAGE} Use null for none.` })
  .trim()
  .toLowerCase()
  .max(CONTACT_EMAIL_MAX_LENGTH, {
    error: `Must be at most ${CONTACT_EMAIL_MAX_LENGTH} characters.`,
  })
  .refine((email) => email === "" || z.email().safeParse(email).success, {
    error: EMAIL_MESSAGE,
  })
  .transform((email) => email || null)
  .nullable();

const commissionRateSchema = z
  .number({
    error: (issue) => (issue.input === undefined ? "Required." : RATE_MESSAGE),
  })
  .gt(0, { error: RATE_MESSAGE })
  .max(MAX_COMMISSION_RATE_PERCENT, { error: RATE_MESSAGE })
  .multipleOf(COMMISSION_RATE_STEP, { error: RATE_MESSAGE });

const contractWindowSchema = z
  .number({ error: WINDOW_MESSAGE })
  .int({ error: WINDOW_MESSAGE })
  .min(MIN_CONTRACT_WINDOW_DAYS, { error: WINDOW_MESSAGE })
  .max(MAX_CONTRACT_WINDOW_DAYS, { error: WINDOW_MESSAGE });

// "paused" pauses the affiliate (no longer selectable for new campaigns); "active" resumes it.
const statusSchema = z.enum(AFFILIATE_STATUSES, { error: STATUS_MESSAGE });

const createAffiliateRequestSchema = {
  body: buildCreateBodySchema(
    {
      name: nameSchema,
      contactEmail: contactEmailSchema.optional(),
      defaultCommissionRatePercent: commissionRateSchema,
      defaultContractWindowDays: contractWindowSchema.optional(),
      status: z
        .never({
          error:
            "A new affiliate is always active; pause it afterwards with PATCH.",
        })
        .optional(),
    },
    { serverGeneratedFields: ["code"] },
  ),
};

// `?search=` keeps the affiliates whose name contains this text; `?status=` those with that status.
const getAffiliatesRequestSchema = {
  query: paginationQuerySchema.extend({
    search: buildSearchSchema({ maxLength: AFFILIATE_NAME_MAX_LENGTH }),
    status: statusSchema.optional(),
  }),
};

const getAffiliateRequestSchema = { params: idParamsSchema };

const updateAffiliateRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
  body: buildUpdateBodySchema(
    {
      name: nameSchema,
      contactEmail: contactEmailSchema,
      defaultCommissionRatePercent: commissionRateSchema,
      defaultContractWindowDays: contractWindowSchema,
      status: statusSchema,
    },
    { immutableFields: ["code"] },
  ),
};

const deleteAffiliateRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
};

module.exports = {
  createAffiliateRequestSchema,
  getAffiliatesRequestSchema,
  getAffiliateRequestSchema,
  updateAffiliateRequestSchema,
  deleteAffiliateRequestSchema,
};
