"use strict";

const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const {
  CHANNEL_NAME_MIN_LENGTH,
  CHANNEL_NAME_MAX_LENGTH,
} = require("../constants/channel.constants");
const { CASE_INSENSITIVE } = require("../utils/mongo");

// A channel is a place where an affiliate posts our tracking link: WhatsApp, Telegram,
// Website / blog, … (ADR-013).
const channelSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.UUID, default: () => randomUUID() },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: CHANNEL_NAME_MIN_LENGTH,
      maxlength: CHANNEL_NAME_MAX_LENGTH,
    },
    currentVersionNo: { type: Number, required: true, default: 1, min: 1 },
  },
  {
    collection: "channels",
    timestamps: true, // adds createdAt and updatedAt
    versionKey: false, // currentVersionNo is our version counter; Mongoose's __v isn't needed
  },
);

// One channel per name, ignoring letter case, so "WhatsApp" and "whatsapp" can't split reports.
// The list endpoint's name sort uses this index too.
channelSchema.index({ name: 1 }, { unique: true, collation: CASE_INSENSITIVE });

const Channel = mongoose.model("Channel", channelSchema);

module.exports = { Channel };
