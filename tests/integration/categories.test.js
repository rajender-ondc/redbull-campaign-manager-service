"use strict";

// API tests for the category endpoints. They exercise the whole stack (routes → validator →
// controller → service → repository) against a real, throwaway, in-memory MongoDB, so unique
// indexes and atomic updates behave exactly as in production.

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");

const { createApp } = require("../../src/app");
const {
  startTestDatabase,
  clearTestDatabase,
  stopTestDatabase,
} = require("../setup/testDatabase");
const {
  UUID_PATTERN,
  assertProblem,
  getFieldErrors,
  sleep,
} = require("../setup/testHelpers");
const {
  createTestUser,
  createAuthorizedApi,
} = require("../setup/testAuth");

const BASE_URL = "/api/v1/categories";

const app = createApp();

before(startTestDatabase);
after(stopTestDatabase);
// Every request is sent by a signed-in admin (ADR-015); auth.test.js covers who may do what.
let adminAuthorization;
const api = createAuthorizedApi(app, () => adminAuthorization);

// Every test starts from empty collections, with a fresh admin, and creates the data it needs.
beforeEach(async () => {
  await clearTestDatabase();
  ({ authorization: adminAuthorization } = await createTestUser());
});

// ---------- helpers ----------

const postCategory = (body) => api.post(BASE_URL).send(body);

async function seedCategory(body) {
  const res = await postCategory(body);
  assert.equal(
    res.status,
    201,
    `test setup failed: ${JSON.stringify(res.body)}`,
  );
  return res.body.data;
}

async function seedCampaignForCategory(categoryId) {
  await mongoose.connection.collection("campaigns").insertOne({
    _id: new mongoose.mongo.UUID(),
    name: "Diwali Spices Sale",
    categoryId: new mongoose.mongo.UUID(categoryId),
  });
}

// ---------- tests ----------

describe("POST /api/v1/categories", () => {
  it("creates a category: 201 with Location, ETag and the new category", async () => {
    const res = await postCategory({
      name: "  Grocery ",
      defaultWindowDays: 10,
      aliases: ["Spices"],
    });

    assert.equal(res.status, 201);
    const category = res.body.data;
    assert.match(category.id, UUID_PATTERN);
    assert.equal(res.headers.location, `${BASE_URL}/${category.id}`);
    assert.equal(res.headers.etag, '"1"');
    assert.equal(category.name, "Grocery");
    assert.equal(category.defaultWindowDays, 10);
    assert.deepEqual(category.aliases, ["spices"]);
    assert.equal(category.currentVersionNo, 1);
    assert.ok(Date.parse(category.createdAt));
    assert.ok(Date.parse(category.updatedAt));
    assert.equal(category._id, undefined);
  });

  it("uses the 7-day network default when defaultWindowDays is omitted", async () => {
    const category = await seedCategory({ name: "Fashion" });

    assert.equal(category.defaultWindowDays, 7);
    assert.deepEqual(category.aliases, []);
  });

  it("stores aliases trimmed, lowercased, with spaces collapsed and duplicates removed", async () => {
    const category = await seedCategory({
      name: "Grocery",
      aliases: ["  Spices ", "spices", "Dry   Fruits"],
    });

    assert.deepEqual(category.aliases, ["spices", "dry fruits"]);
  });

  it("rejects a name that already exists in another letter case: 409 CATEGORY_NAME_TAKEN", async () => {
    await seedCategory({ name: "Grocery" });

    const res = await postCategory({ name: "GROCERY" });

    assertProblem(res, 409, "CATEGORY_NAME_TAKEN");
  });

  it("rejects an alias that belongs to another category: 409 CATEGORY_ALIAS_TAKEN", async () => {
    await seedCategory({ name: "Grocery", aliases: ["spices"] });

    const res = await postCategory({ name: "Snacks", aliases: ["Spices"] });

    assertProblem(res, 409, "CATEGORY_ALIAS_TAKEN");
    assert.match(res.body.detail, /"spices"/);
  });

  it("allows several categories without aliases", async () => {
    await seedCategory({ name: "Fashion" });
    await seedCategory({ name: "Electronics", aliases: [] });
  });

  it("rejects invalid input with 400 and lists every invalid field", async () => {
    const res = await postCategory({
      defaultWindowDays: 0,
      aliases: "spices",
      colour: "red",
    });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.deepEqual(getFieldErrors(res), {
      name: "Required.",
      defaultWindowDays: "Must be a whole number from 1 to 60.",
      aliases: "Must be a list of strings.",
      colour: "Unknown field.",
    });
    assert.equal(res.body.detail, "4 invalid fields.");
  });

  it("rejects a window that is not a whole number from 1 to 60", async () => {
    for (const value of [0, 61, 7.5, "7", null]) {
      const res = await postCategory({
        name: "Grocery",
        defaultWindowDays: value,
      });

      assertProblem(res, 400, "VALIDATION_FAILED");
      assert.equal(
        getFieldErrors(res).defaultWindowDays,
        "Must be a whole number from 1 to 60.",
        `value ${value}`,
      );
    }
  });

  it("rejects names shorter than 2 or longer than 100 characters", async () => {
    for (const name of ["G", " G ", "x".repeat(101)]) {
      const res = await postCategory({ name });

      assertProblem(res, 400, "VALIDATION_FAILED");
      assert.equal(getFieldErrors(res).name, "Must be 2 to 100 characters.");
    }
  });

  it("rejects more than 50 aliases, and empty aliases", async () => {
    const tooManyAliases = Array.from(
      { length: 51 },
      (_, index) => `alias ${index}`,
    );

    const tooManyResponse = await postCategory({
      name: "Grocery",
      aliases: tooManyAliases,
    });
    const emptyAliasResponse = await postCategory({
      name: "Grocery",
      aliases: ["  "],
    });

    assert.equal(
      getFieldErrors(tooManyResponse).aliases,
      "At most 50 aliases.",
    );
    assert.equal(
      getFieldErrors(emptyAliasResponse)["aliases.0"],
      "Aliases must not be empty.",
    );
  });

  it("rejects an id in the body, because the server generates it", async () => {
    const res = await postCategory({ id: randomUUID(), name: "Grocery" });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.equal(getFieldErrors(res).id, "id is generated by the server.");
  });

  it("rejects a body that is not valid JSON: 400 MALFORMED_JSON", async () => {
    const res = await api
      .post(BASE_URL)
      .set("Content-Type", "application/json")
      .send('{"name":');

    assertProblem(res, 400, "MALFORMED_JSON");
  });

  it("rejects a body that is not JSON: 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const res = await api
      .post(BASE_URL)
      .set("Content-Type", "text/plain")
      .send("name=Grocery");

    assertProblem(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a JSON body that is not an object", async () => {
    const res = await postCategory(["Grocery"]);

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.equal(
      getFieldErrors(res).body,
      "The request body must be a JSON object.",
    );
  });
});

describe("GET /api/v1/categories", () => {
  it("lists categories sorted by name ignoring letter case, one page at a time", async () => {
    await seedCategory({ name: "Grocery" });
    await seedCategory({ name: "electronics" });
    await seedCategory({ name: "Fashion" });

    const firstPage = await api.get(BASE_URL).query({ limit: 2 });
    const secondPage = await api
      .get(BASE_URL)
      .query({ page: 2, limit: 2 });

    assert.equal(firstPage.status, 200);
    assert.deepEqual(
      firstPage.body.data.map((category) => category.name),
      ["electronics", "Fashion"],
    );
    assert.deepEqual(firstPage.body.pagination, {
      page: 1,
      limit: 2,
      totalItems: 3,
      totalPages: 2,
    });
    assert.deepEqual(
      secondPage.body.data.map((category) => category.name),
      ["Grocery"],
    );
  });

  it("uses page 1 and limit 20 by default", async () => {
    await seedCategory({ name: "Grocery" });

    const res = await api.get(BASE_URL);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.pagination, {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it("returns an empty page past the end", async () => {
    await seedCategory({ name: "Grocery" });

    const res = await api.get(BASE_URL).query({ page: 3 });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.pagination.totalItems, 1);
  });

  it("rejects invalid paging parameters and unknown query parameters", async () => {
    for (const query of [
      "limit=0",
      "limit=101",
      "limit=abc",
      "limit=2.5",
      "page=0",
      "sort=name",
    ]) {
      const res = await api.get(`${BASE_URL}?${query}`);

      assertProblem(res, 400, "VALIDATION_FAILED");
    }
  });
});

describe("GET /api/v1/categories/:id", () => {
  it("returns the category with its ETag", async () => {
    const createdCategory = await seedCategory({
      name: "Grocery",
      aliases: ["spices"],
    });

    const res = await api.get(`${BASE_URL}/${createdCategory.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"1"');
    assert.deepEqual(res.body.data, createdCategory);
  });

  it("returns 404 CATEGORY_NOT_FOUND for an unknown id", async () => {
    const res = await api.get(`${BASE_URL}/${randomUUID()}`);

    assertProblem(res, 404, "CATEGORY_NOT_FOUND");
  });

  it("returns 400 for an id that is not a UUID", async () => {
    const res = await api.get(`${BASE_URL}/not-a-uuid`);

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.equal(getFieldErrors(res).id, "Must be a valid UUID.");
  });
});

describe("PATCH /api/v1/categories/:id", () => {
  it("changes only the fields sent, keeps the id and increases the version", async () => {
    const createdCategory = await seedCategory({
      name: "Grocery",
      defaultWindowDays: 7,
      aliases: ["spices"],
    });
    await sleep(10);

    const res = await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .send({ name: "Groceries", aliases: ["Staples"] });

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"2"');
    const updatedCategory = res.body.data;
    assert.equal(updatedCategory.id, createdCategory.id);
    assert.equal(updatedCategory.name, "Groceries");
    assert.deepEqual(updatedCategory.aliases, ["staples"]);
    assert.equal(updatedCategory.defaultWindowDays, 7);
    assert.equal(updatedCategory.currentVersionNo, 2);
    assert.equal(updatedCategory.createdAt, createdCategory.createdAt);
    assert.ok(
      Date.parse(updatedCategory.updatedAt) >
        Date.parse(createdCategory.updatedAt),
    );
  });

  it("applies the change when If-Match has the current version", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const res = await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .set("If-Match", '"1"')
      .send({ defaultWindowDays: 10 });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.defaultWindowDays, 10);
  });

  it("refuses a stale If-Match with 412 VERSION_MISMATCH and changes nothing", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });
    await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .send({ defaultWindowDays: 10 }); // now version 2

    const res = await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .set("If-Match", '"1"')
      .send({ defaultWindowDays: 30 });

    assertProblem(res, 412, "VERSION_MISMATCH");
    const currentResponse = await api.get(
      `${BASE_URL}/${createdCategory.id}`,
    );
    assert.equal(currentResponse.body.data.defaultWindowDays, 10);
    assert.equal(currentResponse.body.data.currentVersionNo, 2);
  });

  it("rejects an If-Match header that is not one of our ETags", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const res = await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .set("If-Match", "1")
      .send({ name: "Groceries" });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.ok(getFieldErrors(res)["if-match"]);
  });

  it("rejects changing the id", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const res = await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .send({ id: randomUUID() });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.equal(getFieldErrors(res).id, "id cannot be changed.");
  });

  it("rejects an empty body", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const res = await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .send({});

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.match(getFieldErrors(res).body, /at least one field/);
  });

  it("returns 404 CATEGORY_NOT_FOUND for an unknown category", async () => {
    const res = await api
      .patch(`${BASE_URL}/${randomUUID()}`)
      .send({ name: "Groceries" });

    assertProblem(res, 404, "CATEGORY_NOT_FOUND");
  });

  it("rejects a name or an alias already used by another category: 409", async () => {
    await seedCategory({ name: "Grocery", aliases: ["spices"] });
    const fashionCategory = await seedCategory({ name: "Fashion" });

    const sameNameResponse = await api
      .patch(`${BASE_URL}/${fashionCategory.id}`)
      .send({ name: "grocery" });
    const sameAliasResponse = await api
      .patch(`${BASE_URL}/${fashionCategory.id}`)
      .send({ aliases: ["SPICES"] });

    assertProblem(sameNameResponse, 409, "CATEGORY_NAME_TAKEN");
    assertProblem(sameAliasResponse, 409, "CATEGORY_ALIAS_TAKEN");
  });
});

describe("DELETE /api/v1/categories/:id", () => {
  it("deletes an unused category: 204, then the category is gone", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const res = await api.delete(`${BASE_URL}/${createdCategory.id}`);

    assert.equal(res.status, 204);
    assert.equal(res.text, "");
    assertProblem(
      await api.get(`${BASE_URL}/${createdCategory.id}`),
      404,
      "CATEGORY_NOT_FOUND",
    );
    assertProblem(
      await api.delete(`${BASE_URL}/${createdCategory.id}`),
      404,
      "CATEGORY_NOT_FOUND",
    );
  });

  it("refuses to delete a category a campaign uses: 409 CATEGORY_IN_USE", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });
    await seedCampaignForCategory(createdCategory.id);

    const res = await api.delete(`${BASE_URL}/${createdCategory.id}`);

    assertProblem(res, 409, "CATEGORY_IN_USE");
    const currentResponse = await api.get(
      `${BASE_URL}/${createdCategory.id}`,
    );
    assert.equal(currentResponse.status, 200);
  });

  it("refuses a stale If-Match with 412 and keeps the category", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });
    await api
      .patch(`${BASE_URL}/${createdCategory.id}`)
      .send({ defaultWindowDays: 10 }); // now version 2

    const res = await api
      .delete(`${BASE_URL}/${createdCategory.id}`)
      .set("If-Match", '"1"');

    assertProblem(res, 412, "VERSION_MISMATCH");
    const currentResponse = await api.get(
      `${BASE_URL}/${createdCategory.id}`,
    );
    assert.equal(currentResponse.status, 200);
  });

  it("deletes when If-Match has the current version", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const res = await api
      .delete(`${BASE_URL}/${createdCategory.id}`)
      .set("If-Match", '"1"');

    assert.equal(res.status, 204);
  });
});

describe("Unsupported requests", () => {
  it("returns 405 METHOD_NOT_ALLOWED with an Allow header", async () => {
    const createdCategory = await seedCategory({ name: "Grocery" });

    const putResponse = await api
      .put(`${BASE_URL}/${createdCategory.id}`)
      .send({ name: "Groceries" });
    const deleteCollectionResponse = await api.delete(BASE_URL);

    assertProblem(putResponse, 405, "METHOD_NOT_ALLOWED");
    assert.equal(putResponse.headers.allow, "GET, PATCH, DELETE");
    assertProblem(deleteCollectionResponse, 405, "METHOD_NOT_ALLOWED");
    assert.equal(deleteCollectionResponse.headers.allow, "GET, POST");
  });

  it("returns 404 ROUTE_NOT_FOUND as Problem Details for unknown URLs", async () => {
    const res = await api.get("/api/v1/unknown");

    assertProblem(res, 404, "ROUTE_NOT_FOUND");
    assert.equal(res.body.instance, "/api/v1/unknown");
    assert.equal(res.body.type, "/problems/route-not-found");
  });
});
