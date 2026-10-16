"use strict";

const { z } = require("zod");
const { EMAIL_MAX_LENGTH } = require("../constants/user.constants");
const { buildBodySchema } = require("../utils/validation");
const {
  emailSchema,
  passwordSchema,
  enteredPasswordSchema,
} = require("./user.validator");

// At login the email isn't checked for format: any wrong email simply gets "incorrect email or
// password", the same as a wrong password (ADR-015).
const loginRequestSchema = {
  body: buildBodySchema({
    email: z
      .string({
        error: (issue) =>
          issue.input === undefined ? "Required." : "Must be a string.",
      })
      .trim()
      .toLowerCase()
      .min(1, { error: "Required." })
      .max(EMAIL_MAX_LENGTH, {
        error: `Must be at most ${EMAIL_MAX_LENGTH} characters.`,
      }),
    password: enteredPasswordSchema,
  }),
};

// ⚠ Accepted risk (ADR-015): no verification yet; the new password must meet the password rules.
const forgotPasswordRequestSchema = {
  body: buildBodySchema({ email: emailSchema, newPassword: passwordSchema }),
};

module.exports = { loginRequestSchema, forgotPasswordRequestSchema };
