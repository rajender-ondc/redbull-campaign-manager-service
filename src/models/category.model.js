"use strict";

const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const {
  CATEGORY_NAME_MIN_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  MIN_WINDOW_DAYS,
  MAX_WINDOW_DAYS,
} = require("../constants/category.constants");
const { CASE_INSENSITIVE } = require("../utils/mongo");

const categorySchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.UUID, default: () => randomUUID() },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: CATEGORY_NAME_MIN_LENGTH,
      maxlength: CATEGORY_NAME_MAX_LENGTH,
    },
    defaultWindowDays: {
      type: Number,
      required: true,
      min: MIN_WINDOW_DAYS,
      max: MAX_WINDOW_DAYS,
    },
    aliases: { type: [String], default: [] },
    currentVersionNo: { type: Number, required: true, default: 1, min: 1 },
  },
  {
    collection: "categories",
    timestamps: true, // adds createdAt and updatedAt
    versionKey: false, // currentVersionNo is our version counter; Mongoose's __v isn't needed
  },
);

// One category per name, ignoring letter case. The list endpoint's name sort uses this index too.
categorySchema.index(
  { name: 1 },
  { unique: true, collation: CASE_INSENSITIVE },
);

// One category per alias. The partial filter leaves out categories with no aliases, so those never collide.
categorySchema.index(
  { aliases: 1 },
  { unique: true, partialFilterExpression: { aliases: { $type: "string" } } },
);

const Category = mongoose.model("Category", categorySchema);

module.exports = { Category };
