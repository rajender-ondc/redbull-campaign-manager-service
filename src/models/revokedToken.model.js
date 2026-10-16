"use strict";

/**
 * @file Mongoose model for the `revokedtokens` collection (ADR-016): login tokens that were logged
 * out before they expired. S1 refuses any token whose id (`jti`) is stored here. MongoDB deletes
 * each record by itself once its token has expired, so the collection only holds tokens that could
 * otherwise still be used.
 */

const mongoose = require("mongoose");

const revokedTokenSchema = new mongoose.Schema(
  {
    /** The token's own id: its `jti` claim. One record per logged-out token. */
    _id: { type: mongoose.Schema.Types.UUID, required: true },
    /** The user the token belongs to (its `sub` claim), so a record can be traced to a person. */
    userId: { type: mongoose.Schema.Types.UUID, required: true },
    /** When the token expires (its `exp` claim). The TTL index below deletes the record then. */
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "revokedtokens",
    // createdAt is when the user logged out. A record never changes, so there's no updatedAt.
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

// A TTL index: MongoDB's background task, which runs about once a minute, deletes each record once
// `expiresAt` has passed. By then the token is refused anyway, because it has expired.
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** A logged-out token, kept until the token would have expired anyway. */
const RevokedToken = mongoose.model("RevokedToken", revokedTokenSchema);

module.exports = { RevokedToken };
