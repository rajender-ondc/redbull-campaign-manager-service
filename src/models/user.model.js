"use strict";

const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const {
  USER_NAME_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  USER_ROLES,
  USER_STATUS,
  USER_STATUSES,
} = require("../constants/user.constants");

// A person who can log in to the Marketing UI (ADR-015). Users are never deleted, because history
// shows who changed what; an admin disables them instead.
const userSchema = new mongoose.Schema(
  {
    // Becomes `sub` in the user's tokens.
    _id: { type: mongoose.Schema.Types.UUID, default: () => randomUUID() },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: EMAIL_MAX_LENGTH,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: USER_NAME_MIN_LENGTH,
      maxlength: USER_NAME_MAX_LENGTH,
    },
    role: { type: String, required: true, enum: USER_ROLES },
    // Never selected unless a query asks for it ("+passwordHash"), and never returned by the API.
    passwordHash: { type: String, required: true, select: false },
    status: {
      type: String,
      required: true,
      enum: USER_STATUSES,
      default: USER_STATUS.ACTIVE,
    },
    failedAttempts: { type: Number, required: true, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    // The admin who created the account; null for the first admin (scripts/create-admin.js).
    createdBy: { type: mongoose.Schema.Types.UUID, default: null },
    // Tokens issued before this moment are refused.
    passwordChangedAt: { type: Date, required: true },
    lastLoginAt: { type: Date, default: null },
    currentVersionNo: { type: Number, required: true, default: 1, min: 1 },
  },
  {
    collection: "users",
    timestamps: true, // adds createdAt and updatedAt
    versionKey: false, // currentVersionNo is our version counter; Mongoose's __v isn't needed
  },
);

// One account per email. Emails are stored lowercase, so "Ops@ONDC.org" and "ops@ondc.org" collide.
userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);

module.exports = { User };
