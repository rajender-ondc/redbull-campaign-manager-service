"use strict";

const { z } = require("zod");
const {
  USER_NAME_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  USER_ROLES,
  USER_STATUSES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
} = require("../constants/user.constants");
const {
  idParamsSchema,
  ifMatchHeadersSchema,
  paginationQuerySchema,
  buildNameSchema,
  buildSearchSchema,
  buildBodySchema,
  buildCreateBodySchema,
  buildUpdateBodySchema,
} = require("../utils/validation");

const EMAIL_MESSAGE = "Must be a valid email address.";

/** Says "Required." when the field is missing, and `message` when it has the wrong type. */
const requiredOr = (message) => (issue) =>
  issue.input === undefined ? "Required." : message;

const nameSchema = buildNameSchema({
  minLength: USER_NAME_MIN_LENGTH,
  maxLength: USER_NAME_MAX_LENGTH,
});

/** Stored trimmed and lowercase, so "Ops@ONDC.org" and "ops@ondc.org" are the same account. */
const emailSchema = z
  .string({ error: requiredOr(EMAIL_MESSAGE) })
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, {
    error: `Must be at most ${EMAIL_MAX_LENGTH} characters.`,
  })
  .refine((email) => z.email().safeParse(email).success, {
    error: EMAIL_MESSAGE,
  });

// Password rules (ADR-015): at least 8 characters, with an uppercase letter, a lowercase letter, a
// digit and a symbol. Every rule that fails gets its own message. Spaces are allowed but aren't
// symbols, and passwords are never trimmed.
const passwordSchema = z
  .string({ error: requiredOr("Must be a string.") })
  .min(PASSWORD_MIN_LENGTH, {
    error: `Must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  })
  .regex(/[A-Z]/, {
    error: "Must contain at least one uppercase letter (A–Z).",
  })
  .regex(/[a-z]/, {
    error: "Must contain at least one lowercase letter (a–z).",
  })
  .regex(/[0-9]/, { error: "Must contain at least one digit (0–9)." })
  .regex(/[^A-Za-z0-9\s]/, {
    error: "Must contain at least one symbol, such as @ # $ % or !.",
  })
  // bcrypt ignores everything after 72 bytes; letters outside English take more than one byte.
  .refine((password) => Buffer.byteLength(password) <= PASSWORD_MAX_BYTES, {
    error: `Must be at most ${PASSWORD_MAX_BYTES} bytes; letters outside English count as more than one.`,
  });

/** The password being checked (current or at login): no strength rules, just present and bounded. */
const enteredPasswordSchema = z
  .string({ error: requiredOr("Must be a string.") })
  .min(1, { error: "Required." })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  });

const roleSchema = z.enum(USER_ROLES, {
  error: requiredOr(`Must be ${USER_ROLES.join(" or ")}.`),
});

const statusSchema = z.enum(USER_STATUSES, {
  error: requiredOr(`Must be ${USER_STATUSES.join(" or ")}.`),
});

const createUserRequestSchema = {
  body: buildCreateBodySchema({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    password: passwordSchema,
  }),
};

// `?search=` keeps users whose name or email contains this text; `?role=` and `?status=` narrow it.
const getUsersRequestSchema = {
  query: paginationQuerySchema.extend({
    search: buildSearchSchema({ maxLength: EMAIL_MAX_LENGTH }),
    role: roleSchema.optional(),
    status: statusSchema.optional(),
  }),
};

const getUserRequestSchema = { params: idParamsSchema };

// Passwords aren't changed here: users change their own (PUT /users/me/password) or use forgot password.
const updateUserRequestSchema = {
  params: idParamsSchema,
  headers: ifMatchHeadersSchema,
  body: buildUpdateBodySchema({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
    status: statusSchema,
  }),
};

const changePasswordRequestSchema = {
  body: buildBodySchema({
    currentPassword: enteredPasswordSchema,
    newPassword: passwordSchema,
  }),
};

module.exports = {
  emailSchema,
  passwordSchema,
  enteredPasswordSchema,
  createUserRequestSchema,
  getUsersRequestSchema,
  getUserRequestSchema,
  updateUserRequestSchema,
  changePasswordRequestSchema,
};
