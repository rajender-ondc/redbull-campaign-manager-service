"use strict";

// Constants for users and login (ADR-015): the limits and rules that the model, the validators and
// the services all read from here, and the name used in error messages and codes.

/** Used in error messages and to build error codes, e.g. USER_NOT_FOUND. */
const USER_RESOURCE_NAME = "user";

const USER_NAME_MIN_LENGTH = 2;
const USER_NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;

/** admin: changes configuration and manages users. user: reads configuration (PRD S5-01). */
const USER_ROLE = Object.freeze({ ADMIN: "admin", USER: "user" });
const USER_ROLES = Object.values(USER_ROLE);

/** A disabled user can't log in, and their tokens stop working in S1. */
const USER_STATUS = Object.freeze({ ACTIVE: "active", DISABLED: "disabled" });
const USER_STATUSES = Object.values(USER_STATUS);

// Password rules: at least 8 characters, with an uppercase letter, a lowercase letter, a digit and
// a symbol. At most 64 characters (and 72 bytes), because bcrypt ignores anything after 72 bytes.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_MAX_BYTES = 72;

/** 5 wrong passwords in a row lock the account for 15 minutes. */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

module.exports = {
  USER_RESOURCE_NAME,
  USER_NAME_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  USER_ROLE,
  USER_ROLES,
  USER_STATUS,
  USER_STATUSES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_MINUTES,
};
