"use strict";

// Constants for affiliates (ADR-014): the business limits that the model, the validator and the
// service all read from here, the status values, the code format, and the name used in error
// messages and codes.

/** Used in error messages and to build error codes, e.g. AFFILIATE_NOT_FOUND. */
const AFFILIATE_RESOURCE_NAME = "affiliate";

const AFFILIATE_NAME_MIN_LENGTH = 2;
const AFFILIATE_NAME_MAX_LENGTH = 100;

const CONTACT_EMAIL_MAX_LENGTH = 254;

/** A default commission is above 0 and at most 100%, with up to 2 decimals (6, 6.5, 7.25). */
const MIN_COMMISSION_RATE_PERCENT = 0.01;
const MAX_COMMISSION_RATE_PERCENT = 100;
const COMMISSION_RATE_STEP = 0.01;

const MIN_CONTRACT_WINDOW_DAYS = 1;
const MAX_CONTRACT_WINDOW_DAYS = 60;
/** The prototype's default. Used when an affiliate is created without a contract window. */
const DEFAULT_CONTRACT_WINDOW_DAYS = 14;

/** A paused affiliate can't be added to new campaigns; campaigns it's already on keep running. */
const AFFILIATE_STATUS = Object.freeze({ ACTIVE: "active", PAUSED: "paused" });
const AFFILIATE_STATUSES = Object.values(AFFILIATE_STATUS);

// The code in tracking links: 2 lowercase letters from the name, then 4 characters from an alphabet
// with no vowels (so a public link can never spell a word) and no look-alikes (0/O, 1/I/L).
const CODE_SUFFIX_ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789";
const CODE_SUFFIX_LENGTH = 4;
/** The prefix of a name without Latin letters. */
const FALLBACK_CODE_PREFIX = "af";
/** Pads the prefix of a one-letter word ("X1" → "xx"). */
const CODE_PREFIX_PADDING = "x";
/** How many fresh codes to try when a generated code is already taken. */
const MAX_CODE_ATTEMPTS = 5;

module.exports = {
  AFFILIATE_RESOURCE_NAME,
  AFFILIATE_NAME_MIN_LENGTH,
  AFFILIATE_NAME_MAX_LENGTH,
  CONTACT_EMAIL_MAX_LENGTH,
  MIN_COMMISSION_RATE_PERCENT,
  MAX_COMMISSION_RATE_PERCENT,
  COMMISSION_RATE_STEP,
  MIN_CONTRACT_WINDOW_DAYS,
  MAX_CONTRACT_WINDOW_DAYS,
  DEFAULT_CONTRACT_WINDOW_DAYS,
  AFFILIATE_STATUS,
  AFFILIATE_STATUSES,
  CODE_SUFFIX_ALPHABET,
  CODE_SUFFIX_LENGTH,
  FALLBACK_CODE_PREFIX,
  CODE_PREFIX_PADDING,
  MAX_CODE_ATTEMPTS,
};
