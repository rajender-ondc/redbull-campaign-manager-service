"use strict";

// MongoDB helpers that every resource's model and repository reuse (ADR-012). Every S1 resource is
// stored with a UUID `_id`, a `currentVersionNo` that goes up by 1 on every change, and timestamps.

/** Compares text ignoring letter case, so "Grocery" and "grocery" count as the same name. */
const CASE_INSENSITIVE = Object.freeze({ locale: "en", strength: 2 });

const DUPLICATE_KEY_ERROR = 11000;

/** Transforms a stored document to the API shape: MongoDB's `_id` becomes `id`. Null stays null. */
function transformToResource(doc) {
  if (!doc) {
    return null;
  }
  const { _id: mongoId, ...resourceData } = doc;
  return { id: mongoId.toString(), ...resourceData };
}

/** True if the error is a unique-index violation. */
function isDuplicateKeyError(err) {
  return err?.code === DUPLICATE_KEY_ERROR;
}

/**
 * Builds a pattern that finds `text` anywhere in a value, ignoring letter case: the `?search=`
 * convention (ADR-010 §2). Characters that mean something in a pattern ("." "*" "(" …) are escaped,
 * so "Website / blog" or "C++" are found exactly as typed and a search can never run a costly
 * pattern. It's a RegExp, not a `$regex` object, because the sanitizeFilter guard
 * (config/database.js) neutralises `$` keys.
 */
function buildContainsPattern(text) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/**
 * Gets one page of the documents that match `filter` (all documents when it's omitted), in the
 * given order with text compared ignoring letter case, plus the total number of matches.
 * @param {import('mongoose').Model} Model
 * @param {{ page: number, limit: number, sort: Record<string, 1 | -1>, filter?: object }} pageRequest
 * @returns {Promise<{ items: object[], totalItems: number }>}
 */
async function getDocumentPage(Model, { page, limit, sort, filter = {} }) {
  const [docs, totalItems] = await Promise.all([
    Model.find(filter)
      .sort(sort)
      .collation(CASE_INSENSITIVE)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Model.countDocuments(filter),
  ]);
  return { items: docs.map(transformToResource), totalItems };
}

/**
 * Applies `changes` and increases currentVersionNo by 1, in one atomic operation that runs the
 * model's validators. If `expectedVersion` is given, the update only happens while the stored
 * version still equals it.
 *
 * @returns {Promise<object|null>} The updated resource, or null if nothing matched
 *   (no such document, or its version has changed).
 */
async function updateVersionedDocument(Model, id, changes, expectedVersion) {
  const doc = await Model.findOneAndUpdate(
    buildIdAndVersionFilter(id, expectedVersion),
    { $set: changes, $inc: { currentVersionNo: 1 } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  return transformToResource(doc);
}

/**
 * Deletes the document. Like updateVersionedDocument, `expectedVersion` (if given) must still match.
 * @returns {Promise<boolean>} true if a document was deleted.
 */
async function deleteVersionedDocument(Model, id, expectedVersion) {
  const { deletedCount } = await Model.deleteOne(
    buildIdAndVersionFilter(id, expectedVersion),
  );
  return deletedCount === 1;
}

function buildIdAndVersionFilter(id, expectedVersion) {
  return expectedVersion === undefined
    ? { _id: id }
    : { _id: id, currentVersionNo: expectedVersion };
}

module.exports = {
  CASE_INSENSITIVE,
  transformToResource,
  isDuplicateKeyError,
  buildContainsPattern,
  getDocumentPage,
  updateVersionedDocument,
  deleteVersionedDocument,
};
