"use strict";

const categoryRepository = require("../repositories/category.repository");
const {
  createNotFoundError,
  createInUseError,
  createWriteFailureError,
  assertVersionMatches,
} = require("../errors/ApiError");
const {
  CATEGORY_RESOURCE_NAME,
  NETWORK_DEFAULT_WINDOW_DAYS,
} = require("../constants/category.constants");

/** @param {{ name: string, defaultWindowDays?: number, aliases?: string[] }} categoryInput */
async function createCategory(categoryInput) {
  return categoryRepository.create({
    name: categoryInput.name,
    defaultWindowDays:
      categoryInput.defaultWindowDays ?? NETWORK_DEFAULT_WINDOW_DAYS,
    aliases: categoryInput.aliases ?? [],
  });
}

async function getCategory(id) {
  const category = await categoryRepository.getById(id);
  if (!category) {
    throw createNotFoundError(CATEGORY_RESOURCE_NAME, id);
  }
  return category;
}

/**
 * @param {{ page: number, limit: number }} pageRequest
 * @returns {Promise<{ items: object[], totalItems: number }>}
 */
async function getCategories(pageRequest) {
  return categoryRepository.getPage(pageRequest);
}

/**
 * Changes the given fields of a category.
 * @param {string} id
 * @param {{ name?: string, defaultWindowDays?: number, aliases?: string[] }} changes
 * @param {number} [expectedVersion] From If-Match; the update is refused (412) if the category changed since.
 */
async function updateCategory(id, changes, expectedVersion) {
  const updatedCategory = await categoryRepository.updateById(
    id,
    changes,
    expectedVersion,
  );
  if (updatedCategory) {
    return updatedCategory;
  }
  throw createWriteFailureError(
    CATEGORY_RESOURCE_NAME,
    id,
    await categoryRepository.getById(id),
    expectedVersion,
  );
}

/**
 * Permanently deletes a category, but only while no campaign uses it (ADR-011).
 * @param {string} id
 * @param {number} [expectedVersion] From If-Match; the delete is refused (412) if the category changed since.
 */
async function deleteCategory(id, expectedVersion) {
  const category = await getCategory(id);
  assertVersionMatches(CATEGORY_RESOURCE_NAME, category, expectedVersion);
  if (await categoryRepository.isInUse(id)) {
    throw createInUseError(CATEGORY_RESOURCE_NAME, category.name);
  }
  const isDeleted = await categoryRepository.deleteById(id, expectedVersion);
  if (!isDeleted) {
    // Someone deleted or changed it between our checks and the delete.
    throw createWriteFailureError(
      CATEGORY_RESOURCE_NAME,
      id,
      await categoryRepository.getById(id),
      expectedVersion,
    );
  }
}

module.exports = {
  createCategory,
  getCategory,
  getCategories,
  updateCategory,
  deleteCategory,
};
