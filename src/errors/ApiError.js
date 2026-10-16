"use strict";

/**
 * An expected error that should reach the client as an HTTP error response, such as
 * "not found" or "name already taken".
 * Any layer may throw it; the central error handler (middlewares/errorHandler.js)
 * turns it into RFC 9457 Problem Details.
 */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code, e.g. 404.
   * @param {string} code Stable machine-readable code, e.g. 'CATEGORY_NOT_FOUND'.
   * @param {string} detail Human-readable explanation of this occurrence.
   * @param {Array<{ field: string, message: string }>} [errors] Field-level problems, for validation errors.
   * @param {Record<string, string>} [headers] Response headers that belong to this error, such as
   *   `WWW-Authenticate` on a 401 or `Retry-After` on a 423.
   */
  constructor(status, code, detail, errors, headers) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.headers = headers;
  }
}

// Builders for the errors every resource can raise (ADR-012). `resourceName` is the lowercase name
// used in messages ("category"); the error code is built from it ("category" → CATEGORY_NOT_FOUND).

/** 404 <RESOURCE>_NOT_FOUND: no item has this id. */
function createNotFoundError(resourceName, id) {
  return new ApiError(
    404,
    `${formatCodePrefix(resourceName)}_NOT_FOUND`,
    `No ${resourceName} has the id ${id}.`,
  );
}

/** 409 <RESOURCE>_NAME_TAKEN: another item already has this name, ignoring letter case. */
function createNameTakenError(resourceName, name) {
  return new ApiError(
    409,
    `${formatCodePrefix(resourceName)}_NAME_TAKEN`,
    `The name "${name}" is already used by another ${resourceName} (names are compared ignoring letter case).`,
  );
}

/** 409 <RESOURCE>_IN_USE: a campaign still uses the item, so it can't be deleted. */
function createInUseError(resourceName, name) {
  return new ApiError(
    409,
    `${formatCodePrefix(resourceName)}_IN_USE`,
    `${formatCapitalized(resourceName)} "${name}" is used by at least one campaign, so it can't be deleted.`,
  );
}

/** 412 VERSION_MISMATCH: the item has changed since the version the client sent in If-Match. */
function createVersionMismatchError(
  resourceName,
  expectedVersion,
  currentVersion,
) {
  return new ApiError(
    412,
    "VERSION_MISMATCH",
    `The ${resourceName} has changed since version ${expectedVersion} (it is now at version ${currentVersion}). Fetch it again and retry.`,
  );
}

/**
 * Throws 412 VERSION_MISMATCH if `expectedVersion` (from If-Match) is given and isn't the
 * item's current version.
 */
function assertVersionMatches(resourceName, resource, expectedVersion) {
  if (
    expectedVersion !== undefined &&
    resource.currentVersionNo !== expectedVersion
  ) {
    throw createVersionMismatchError(
      resourceName,
      expectedVersion,
      resource.currentVersionNo,
    );
  }
}

/**
 * Explains why an update or delete with an optional expected version matched nothing:
 * the item is gone (404), or it has changed since that version (412).
 * @param {object|null} currentResource The item as it is now, or null if it no longer exists.
 */
function createWriteFailureError(
  resourceName,
  id,
  currentResource,
  expectedVersion,
) {
  if (!currentResource || expectedVersion === undefined) {
    return createNotFoundError(resourceName, id);
  }
  return createVersionMismatchError(
    resourceName,
    expectedVersion,
    currentResource.currentVersionNo,
  );
}

/** Formats a resource name as an error-code prefix: "buyer app" → "BUYER_APP". */
function formatCodePrefix(resourceName) {
  return resourceName.toUpperCase().replaceAll(" ", "_");
}

function formatCapitalized(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

module.exports = {
  ApiError,
  createNotFoundError,
  createNameTakenError,
  createInUseError,
  createVersionMismatchError,
  assertVersionMatches,
  createWriteFailureError,
};
