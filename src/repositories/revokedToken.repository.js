"use strict";

/**
 * @file Data access for logged-out tokens (ADR-016): the only code that reads or writes the
 * `revokedtokens` collection.
 */

const { RevokedToken } = require("../models/revokedToken.model");
const { isDuplicateKeyError } = require("../utils/mongo");

/**
 * Records a token as logged out until it expires. Recording the same token twice isn't an error,
 * so a repeated logout (a retried request, or two requests at the same moment) still succeeds.
 *
 * @param {object} revokedToken - The token to record.
 * @param {string} revokedToken.tokenId - The token's id (its `jti` claim).
 * @param {string} revokedToken.userId - The user the token belongs to.
 * @param {Date} revokedToken.expiresAt - When the token expires; the record is deleted after that.
 * @returns {Promise<void>}
 */
async function create({ tokenId, userId, expiresAt }) {
  try {
    await RevokedToken.create({ _id: tokenId, userId, expiresAt });
  } catch (err) {
    // The token is already recorded, which is exactly the state we want. Anything else is a real error.
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
  }
}

/**
 * Checks whether a token was logged out.
 *
 * @param {string} tokenId - The token's id (its `jti` claim).
 * @returns {Promise<boolean>} true if the token was logged out.
 */
async function isRevoked(tokenId) {
  return (await RevokedToken.exists({ _id: tokenId })) !== null;
}

module.exports = { create, isRevoked };
