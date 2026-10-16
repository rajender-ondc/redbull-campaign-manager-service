"use strict";

const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const {
  AFFILIATE_NAME_MIN_LENGTH,
  AFFILIATE_NAME_MAX_LENGTH,
  CONTACT_EMAIL_MAX_LENGTH,
  MIN_COMMISSION_RATE_PERCENT,
  MAX_COMMISSION_RATE_PERCENT,
  MIN_CONTRACT_WINDOW_DAYS,
  MAX_CONTRACT_WINDOW_DAYS,
  AFFILIATE_STATUS,
  AFFILIATE_STATUSES,
} = require("../constants/affiliate.constants");
const { CASE_INSENSITIVE } = require("../utils/mongo");

// An affiliate is a traffic partner network that spreads our tracking links and is paid commission
// on attributed orders: CashKaro, Admitad, Wishlink, … (ADR-014).
const affiliateSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.UUID, default: () => randomUUID() },
    // Tracking links contain the code, so it never changes, not even on a rename (ADR-014).
    code: { type: String, required: true, immutable: true },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: AFFILIATE_NAME_MIN_LENGTH,
      maxlength: AFFILIATE_NAME_MAX_LENGTH,
    },
    contactEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: CONTACT_EMAIL_MAX_LENGTH,
    },
    defaultCommissionRatePercent: {
      type: Number,
      required: true,
      min: MIN_COMMISSION_RATE_PERCENT,
      max: MAX_COMMISSION_RATE_PERCENT,
    },
    defaultContractWindowDays: {
      type: Number,
      required: true,
      min: MIN_CONTRACT_WINDOW_DAYS,
      max: MAX_CONTRACT_WINDOW_DAYS,
    },
    status: {
      type: String,
      required: true,
      enum: AFFILIATE_STATUSES,
      default: AFFILIATE_STATUS.ACTIVE,
    },
    currentVersionNo: { type: Number, required: true, default: 1, min: 1 },
  },
  {
    collection: "affiliates",
    timestamps: true, // adds createdAt and updatedAt
    versionKey: false, // currentVersionNo is our version counter; Mongoose's __v isn't needed
  },
);

// One affiliate per name, ignoring letter case. The list endpoint's name sort uses this index too.
affiliateSchema.index(
  { name: 1 },
  { unique: true, collation: CASE_INSENSITIVE },
);

// One affiliate per code, ignoring letter case, so a code in a link can be matched in any case.
affiliateSchema.index(
  { code: 1 },
  { unique: true, collation: CASE_INSENSITIVE },
);

const Affiliate = mongoose.model("Affiliate", affiliateSchema);

module.exports = { Affiliate };
