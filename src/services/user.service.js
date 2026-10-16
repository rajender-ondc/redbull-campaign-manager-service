"use strict";

const userRepository = require("../repositories/user.repository");
const {
  ApiError,
  createNotFoundError,
  createWriteFailureError,
} = require("../errors/ApiError");
const {
  USER_RESOURCE_NAME,
  USER_ROLE,
  USER_STATUS,
} = require("../constants/user.constants");
const { hashPassword, generatePassword } = require("../utils/password");

// Account management (ADR-015): admins create, list, edit and disable users. Passwords and login
// live in auth.service.js.

/**
 * Creates a user account. The admin shares the password with the person manually; there's no
 * forced change at first login.
 * @param {{ name: string, email: string, role: string, password: string }} userInput
 * @param {string} createdById The admin creating the account.
 */
async function createUser(userInput, createdById) {
  return userRepository.create({
    email: userInput.email,
    name: userInput.name,
    role: userInput.role,
    passwordHash: await hashPassword(userInput.password),
    status: USER_STATUS.ACTIVE,
    createdBy: createdById,
    passwordChangedAt: new Date(),
  });
}

async function getUser(id) {
  const user = await userRepository.getById(id);
  if (!user) {
    throw createNotFoundError(USER_RESOURCE_NAME, id);
  }
  return user;
}

/**
 * @param {{ page: number, limit: number, search?: string, role?: string, status?: string }} listRequest
 * @returns {Promise<{ items: object[], totalItems: number }>}
 */
async function getUsers(listRequest) {
  return userRepository.getPage(listRequest);
}

/**
 * Changes a user's name, email, role or status (disable / enable). Never leaves the system without
 * an active admin, or nobody could manage users any more.
 * @param {string} id
 * @param {{ name?: string, email?: string, role?: string, status?: string }} changes
 * @param {number} [expectedVersion] From If-Match; the update is refused (412) if the user changed since.
 */
async function updateUser(id, changes, expectedVersion) {
  if (isRemovingAdminRights(changes)) {
    await assertNotLastActiveAdmin(id);
  }
  const updatedUser = await userRepository.updateById(
    id,
    changes,
    expectedVersion,
  );
  if (updatedUser) {
    return updatedUser;
  }
  throw createWriteFailureError(
    USER_RESOURCE_NAME,
    id,
    await userRepository.getById(id),
    expectedVersion,
  );
}

/**
 * Creates the first admin at go-live (scripts/create-admin.js), with a generated password that is
 * returned once. Refused when an active admin already exists: more users are created through the API.
 * @param {{ email: string, name: string }} adminInput
 * @returns {Promise<{ admin: object, password: string }>}
 */
async function createFirstAdmin({ email, name }) {
  if ((await userRepository.countActiveAdmins()) > 0) {
    throw new Error(
      "An active admin already exists. Create more users through the API (POST /api/v1/users).",
    );
  }
  const password = generatePassword();
  const admin = await userRepository.create({
    email,
    name,
    role: USER_ROLE.ADMIN,
    passwordHash: await hashPassword(password),
    status: USER_STATUS.ACTIVE,
    createdBy: null,
    passwordChangedAt: new Date(),
  });
  return { admin, password };
}

function isRemovingAdminRights(changes) {
  return (
    changes.role === USER_ROLE.USER || changes.status === USER_STATUS.DISABLED
  );
}

async function assertNotLastActiveAdmin(id) {
  const user = await getUser(id);
  const isActiveAdmin =
    user.role === USER_ROLE.ADMIN && user.status === USER_STATUS.ACTIVE;
  if (isActiveAdmin && (await userRepository.countActiveAdmins()) <= 1) {
    throw new ApiError(
      409,
      "LAST_ADMIN",
      `${user.name} is the only active admin, so they can't be disabled or made a user. Make someone else an admin first.`,
    );
  }
}

module.exports = {
  createUser,
  getUser,
  getUsers,
  updateUser,
  createFirstAdmin,
};
