"use strict";

// Success-response helpers that every controller reuses (ADR-010 §2, ADR-012): the `{ data }`
// envelope, the ETag (the item's currentVersionNo) and the Location of a new item.

/** Sends 201 Created with the new item, its Location and its ETag. */
function sendCreated(req, res, resource) {
  res
    .status(201)
    .location(`${req.baseUrl}/${resource.id}`)
    .set("ETag", formatEtag(resource))
    .json({ data: resource });
}

/** Sends 200 with one item and its ETag. */
function sendResource(res, resource) {
  res.set("ETag", formatEtag(resource)).json({ data: resource });
}

/**
 * Sends 200 with one page of a list and its pagination block.
 * @param {{ items: object[], totalItems: number }} resourcePage
 * @param {{ page: number, limit: number }} pageRequest
 */
function sendPage(res, { items, totalItems }, { page, limit }) {
  res.json({
    data: items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  });
}

/** Formats the ETag: the item's version number, quoted as HTTP requires ("3"). */
function formatEtag(resource) {
  return `"${resource.currentVersionNo}"`;
}

module.exports = { sendCreated, sendResource, sendPage };
