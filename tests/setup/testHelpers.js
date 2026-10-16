"use strict";

// Assertions and small helpers that every API test file reuses.

const assert = require("node:assert/strict");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Asserts that the response is a Problem Details error (RFC 9457) with this status and code. */
function assertProblem(res, status, code) {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.match(res.headers["content-type"], /^application\/problem\+json/);
  assert.equal(res.body.status, status);
  assert.equal(res.body.code, code);
}

/** Gets the validation errors as { field: message }, e.g. { name: 'Required.' }. */
function getFieldErrors(res) {
  return Object.fromEntries(
    res.body.errors.map((fieldError) => [fieldError.field, fieldError.message]),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { UUID_PATTERN, assertProblem, getFieldErrors, sleep };
