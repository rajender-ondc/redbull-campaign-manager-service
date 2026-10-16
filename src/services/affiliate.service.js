"use strict";

const crypto = require("node:crypto");
const affiliateRepository = require("../repositories/affiliate.repository");
const {
  createNotFoundError,
  createInUseError,
  createWriteFailureError,
  assertVersionMatches,
} = require("../errors/ApiError");
const {
  AFFILIATE_RESOURCE_NAME,
  AFFILIATE_STATUS,
  DEFAULT_CONTRACT_WINDOW_DAYS,
  CODE_SUFFIX_ALPHABET,
  CODE_SUFFIX_LENGTH,
  FALLBACK_CODE_PREFIX,
  CODE_PREFIX_PADDING,
  MAX_CODE_ATTEMPTS,
} = require("../constants/affiliate.constants");

// The words of a name, for its code prefix: a run of capitals not followed by a lowercase letter
// ("INR" in "INRDeals"), or an optional capital followed by lowercase letters ("Cash", "Karo", "v").
const NAME_WORD_PATTERN = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g;

/**
 * Creates an affiliate. The server gives it a code for its tracking links and makes it active; the
 * contract window defaults to 14 days and the contact email to none (ADR-014).
 * @param {{ name: string, contactEmail?: string|null, defaultCommissionRatePercent: number,
 *           defaultContractWindowDays?: number }} affiliateInput
 */
async function createAffiliate(affiliateInput) {
  const newAffiliate = {
    name: affiliateInput.name,
    contactEmail: affiliateInput.contactEmail ?? null,
    defaultCommissionRatePercent: affiliateInput.defaultCommissionRatePercent,
    defaultContractWindowDays:
      affiliateInput.defaultContractWindowDays ?? DEFAULT_CONTRACT_WINDOW_DAYS,
    status: AFFILIATE_STATUS.ACTIVE,
  };
  // A freshly generated code is very rarely taken already; then a new one is tried.
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await affiliateRepository.create({
        ...newAffiliate,
        code: generateAffiliateCode(newAffiliate.name),
      });
    } catch (err) {
      if (!affiliateRepository.isCodeTakenError(err)) {
        throw err;
      }
    }
  }
  throw new Error(
    `Could not generate an unused affiliate code in ${MAX_CODE_ATTEMPTS} attempts.`,
  );
}

async function getAffiliate(id) {
  const affiliate = await affiliateRepository.getById(id);
  if (!affiliate) {
    throw createNotFoundError(AFFILIATE_RESOURCE_NAME, id);
  }
  return affiliate;
}

/**
 * Gets one page of affiliates; `search` and `status` narrow the list.
 * @param {{ page: number, limit: number, search?: string, status?: string }} listRequest
 * @returns {Promise<{ items: object[], totalItems: number }>}
 */
async function getAffiliates(listRequest) {
  return affiliateRepository.getPage(listRequest);
}

/**
 * Changes an affiliate's details, or pauses / resumes it through `status`. The code never changes,
 * not even on a rename, because tracking links contain it (ADR-014).
 * @param {string} id
 * @param {{ name?: string, contactEmail?: string|null, defaultCommissionRatePercent?: number,
 *           defaultContractWindowDays?: number, status?: string }} changes
 * @param {number} [expectedVersion] From If-Match; the update is refused (412) if the affiliate changed since.
 */
async function updateAffiliate(id, changes, expectedVersion) {
  const updatedAffiliate = await affiliateRepository.updateById(
    id,
    changes,
    expectedVersion,
  );
  if (updatedAffiliate) {
    return updatedAffiliate;
  }
  throw createWriteFailureError(
    AFFILIATE_RESOURCE_NAME,
    id,
    await affiliateRepository.getById(id),
    expectedVersion,
  );
}

/**
 * Permanently deletes an affiliate, but only while no campaign uses it (ADR-014). An affiliate
 * with campaigns is retired by pausing it instead.
 * @param {string} id
 * @param {number} [expectedVersion] From If-Match; the delete is refused (412) if the affiliate changed since.
 */
async function deleteAffiliate(id, expectedVersion) {
  const affiliate = await getAffiliate(id);
  assertVersionMatches(AFFILIATE_RESOURCE_NAME, affiliate, expectedVersion);
  if (await affiliateRepository.isInUse(id)) {
    throw createInUseError(AFFILIATE_RESOURCE_NAME, affiliate.name);
  }
  const isDeleted = await affiliateRepository.deleteById(id, expectedVersion);
  if (!isDeleted) {
    // Someone deleted or changed it between our checks and the delete.
    throw createWriteFailureError(
      AFFILIATE_RESOURCE_NAME,
      id,
      await affiliateRepository.getById(id),
      expectedVersion,
    );
  }
}

/**
 * Generates the code for an affiliate's tracking links (ADR-014): a 2-letter prefix from the name,
 * then 4 random characters with no vowels and no look-alikes, e.g. "ckB7XQ" for CashKaro.
 */
function generateAffiliateCode(name) {
  let suffix = "";
  for (let position = 0; position < CODE_SUFFIX_LENGTH; position++) {
    // Called through the module, not destructured, so tests can control the random choice.
    suffix +=
      CODE_SUFFIX_ALPHABET[crypto.randomInt(CODE_SUFFIX_ALPHABET.length)];
  }
  return formatCodePrefix(name) + suffix;
}

/**
 * Formats the 2-letter code prefix: the initials of the first two words ("CashKaro" → "ck"), or
 * the first two letters of a one-word name ("Admitad" → "ad"). A one-letter word is padded
 * ("X1" → "xx"), and a name without Latin letters gets "af".
 */
function formatCodePrefix(name) {
  const words = name.match(NAME_WORD_PATTERN) ?? [];
  if (words.length === 0) {
    return FALLBACK_CODE_PREFIX;
  }
  const letters =
    words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toLowerCase().padEnd(2, CODE_PREFIX_PADDING);
}

module.exports = {
  createAffiliate,
  getAffiliate,
  getAffiliates,
  updateAffiliate,
  deleteAffiliate,
};
