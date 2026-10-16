"use strict";

const { User } = require("../models/user.model");
const { ApiError } = require("../errors/ApiError");
const { USER_ROLE, USER_STATUS } = require("../constants/user.constants");
const {
  transformToResource,
  isDuplicateKeyError,
  buildContainsPattern,
  getDocumentPage,
  updateVersionedDocument,
} = require("../utils/mongo");

/** Users are listed by name, ignoring letter case. */
const LIST_ORDER = { name: 1 };

/**
 * Creates a user. The id, version and timestamps are set by the database layer.
 * @param {{ email: string, name: string, role: string, passwordHash: string, status: string,
 *           createdBy: string|null, passwordChangedAt: Date }} userInput
 */
async function create(userInput) {
  try {
    const doc = await User.create(userInput);
    return transformToUser(doc.toObject());
  } catch (err) {
    throw transformToConflictError(err, userInput);
  }
}

/** @returns {Promise<object|null>} The user (without the password hash), or null. */
async function getById(id) {
  return transformToUser(await User.findById(id).lean());
}

/** @returns {Promise<object|null>} The user with this (lowercase) email, or null. */
async function getByEmail(email) {
  return transformToUser(await User.findOne({ email }).lean());
}

/**
 * Gets a user together with the password hash, for checking a password. The hash goes only to the
 * login service and never into a response.
 * @returns {Promise<{ user: object, passwordHash: string } | null>}
 */
async function getCredentialsByEmail(email) {
  return transformToCredentials(
    await User.findOne({ email }).select("+passwordHash").lean(),
  );
}

/** Like getCredentialsByEmail, by id. */
async function getCredentialsById(id) {
  return transformToCredentials(
    await User.findById(id).select("+passwordHash").lean(),
  );
}

/**
 * Gets one page of users, sorted by name ignoring letter case, plus the total count.
 * `search` keeps users whose name or email contains the text; `role` and `status` narrow further.
 * @param {{ page: number, limit: number, search?: string, role?: string, status?: string }} listRequest
 */
async function getPage({ page, limit, search, role, status }) {
  const filter = {};
  if (search) {
    const pattern = buildContainsPattern(search);
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  if (role) {
    filter.role = role;
  }
  if (status) {
    filter.status = status;
  }
  const userPage = await getDocumentPage(User, {
    page,
    limit,
    sort: LIST_ORDER,
    filter,
  });
  return { ...userPage, items: userPage.items.map(formatUser) };
}

/**
 * Applies an admin's `changes` (name, email, role, status) and increases currentVersionNo by 1,
 * in one atomic operation. If `expectedVersion` is given, the stored version must still equal it.
 * @returns {Promise<object|null>} The updated user, or null if nothing matched.
 */
async function updateById(id, changes, expectedVersion) {
  try {
    return formatUser(
      await updateVersionedDocument(User, id, changes, expectedVersion),
    );
  } catch (err) {
    throw transformToConflictError(err, changes);
  }
}

async function countActiveAdmins() {
  return User.countDocuments({
    role: USER_ROLE.ADMIN,
    status: USER_STATUS.ACTIVE,
  });
}

/**
 * Counts one more wrong password, in a single atomic update so parallel attempts can't skip the
 * limit. Login state isn't an admin edit, so the version number doesn't change.
 * @returns {Promise<number>} The number of wrong passwords in a row, including this one.
 */
async function recordFailedLogin(id) {
  const user = await User.findOneAndUpdate(
    { _id: id },
    { $inc: { failedAttempts: 1 } },
    { returnDocument: "after", projection: { failedAttempts: 1 } },
  ).lean();
  return user?.failedAttempts ?? 0;
}

/** Locks the account until `lockedUntil` and starts counting wrong passwords again from 0. */
async function lockAccount(id, lockedUntil) {
  await User.updateOne(
    { _id: id },
    { $set: { lockedUntil, failedAttempts: 0 } },
  );
}

async function recordSuccessfulLogin(id, loggedInAt) {
  await User.updateOne(
    { _id: id },
    { $set: { failedAttempts: 0, lockedUntil: null, lastLoginAt: loggedInAt } },
  );
}

/**
 * Stores a new password hash. It also clears a lockout, and tokens issued before `changedAt`
 * stop working.
 */
async function setPassword(id, passwordHash, changedAt) {
  await User.updateOne(
    { _id: id },
    {
      $set: {
        passwordHash,
        passwordChangedAt: changedAt,
        failedAttempts: 0,
        lockedUntil: null,
      },
    },
  );
}

/** Transforms a stored document to the API shape: `id` instead of `_id`, and never the password hash. */
function transformToUser(doc) {
  return formatUser(transformToResource(doc));
}

function transformToCredentials(doc) {
  if (!doc) {
    return null;
  }
  return { user: transformToUser(doc), passwordHash: doc.passwordHash };
}

function formatUser(resource) {
  if (!resource) {
    return null;
  }
  const user = {
    ...resource,
    createdBy: resource.createdBy ? resource.createdBy.toString() : null,
  };
  delete user.passwordHash;
  return user;
}

/** Turns a unique-index violation into a 409 the client can act on; other errors pass through unchanged. */
function transformToConflictError(err, userInput) {
  if (isDuplicateKeyError(err) && err.keyPattern?.email) {
    return new ApiError(
      409,
      "USER_EMAIL_TAKEN",
      `Another user already has the email "${userInput.email}".`,
    );
  }
  return err;
}

module.exports = {
  create,
  getById,
  getByEmail,
  getCredentialsByEmail,
  getCredentialsById,
  getPage,
  updateById,
  countActiveAdmins,
  recordFailedLogin,
  lockAccount,
  recordSuccessfulLogin,
  setPassword,
};
