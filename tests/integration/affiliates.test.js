"use strict";

// API tests for the affiliate endpoints. They exercise the whole stack (routes → validator →
// controller → service → repository) against a real, throwaway, in-memory MongoDB.
// Behaviour affiliates share with other resources through src/utils (malformed JSON, If-Match
// format, paging limits) is tested in depth in categories.test.js.

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

const BASE_URL = "/api/v1/affiliates";
/** Two lowercase letters, then four characters with no vowels and no look-alikes (ADR-014). */
const CODE_PATTERN = /^[a-z]{2}[BCDFGHJKMNPQRSTVWXZ2-9]{4}$/;

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

const postAffiliate = (body) => api.post(BASE_URL).send(body);

/** Creates an affiliate; the commission is 6% unless the body sets it. */
async function seedAffiliate(body) {
  const res = await postAffiliate({ defaultCommissionRatePercent: 6, ...body });
  assert.equal(
    res.status,
    201,
    `test setup failed: ${JSON.stringify(res.body)}`,
  );
  return res.body.data;
}

const patchAffiliate = (id, body) =>
  api.patch(`${BASE_URL}/${id}`).send(body);

const getAffiliateNames = (res) =>
  res.body.data.map((affiliate) => affiliate.name);

/** Stores a campaign that has this affiliate on it. */
async function seedCampaignWithAffiliate(affiliateId) {
  await mongoose.connection.collection("campaigns").insertOne({
    _id: new mongoose.mongo.UUID(),
    name: "Diwali Spices Sale",
    affiliates: [
      {
        affiliateId: new mongoose.mongo.UUID(affiliateId),
        commissionRatePercent: 6,
        contractWindowDays: 14,
        status: "active",
        channelIds: [],
      },
    ],
  });
}

// ---------- tests ----------

describe("POST /api/v1/affiliates", () => {
  it("creates an active affiliate with a generated code: 201 with Location and ETag", async () => {
    const res = await postAffiliate({
      name: "  CashKaro ",
      contactEmail: "  Ops@CashKaro.com ",
      defaultCommissionRatePercent: 6.5,
      defaultContractWindowDays: 30,
    });

    assert.equal(res.status, 201);
    const affiliate = res.body.data;
    assert.match(affiliate.id, UUID_PATTERN);
    assert.equal(res.headers.location, `${BASE_URL}/${affiliate.id}`);
    assert.equal(res.headers.etag, '"1"');
    assert.match(affiliate.code, CODE_PATTERN);
    assert.ok(affiliate.code.startsWith("ck"), affiliate.code);
    assert.equal(affiliate.name, "CashKaro");
    assert.equal(affiliate.contactEmail, "ops@cashkaro.com");
    assert.equal(affiliate.defaultCommissionRatePercent, 6.5);
    assert.equal(affiliate.defaultContractWindowDays, 30);
    assert.equal(affiliate.status, "active");
    assert.equal(affiliate.currentVersionNo, 1);
    assert.deepEqual(Object.keys(affiliate).sort(), [
      "code",
      "contactEmail",
      "createdAt",
      "currentVersionNo",
      "defaultCommissionRatePercent",
      "defaultContractWindowDays",
      "id",
      "name",
      "status",
      "updatedAt",
    ]);
  });

  it("uses a 14-day contract window and no email when they're omitted or blank", async () => {
    const withoutEmail = await seedAffiliate({ name: "Admitad" });
    const withBlankEmail = await seedAffiliate({
      name: "Wishlink",
      contactEmail: "  ",
    });

    assert.equal(withoutEmail.defaultContractWindowDays, 14);
    assert.equal(withoutEmail.contactEmail, null);
    assert.equal(withBlankEmail.contactEmail, null);
  });

  it("builds the code prefix from the name's initials", async () => {
    const expectedPrefixes = {
      CashKaro: "ck",
      Admitad: "ad",
      Wishlink: "wi",
      "Amazon Associates": "aa",
      X1: "xx",
      "कैश करो": "af",
    };

    for (const [name, prefix] of Object.entries(expectedPrefixes)) {
      const affiliate = await seedAffiliate({ name });

      assert.match(affiliate.code, CODE_PATTERN, name);
      assert.equal(affiliate.code.slice(0, 2), prefix, name);
    }
  });

  it("gives affiliates with the same prefix different codes", async () => {
    const cashKaro = await seedAffiliate({ name: "CashKaro" });
    const cashKart = await seedAffiliate({ name: "Cash Kart" });

    assert.equal(cashKaro.code.slice(0, 2), "ck");
    assert.equal(cashKart.code.slice(0, 2), "ck");
    assert.notEqual(cashKaro.code, cashKart.code);
  });

  it("tries a new code when the generated one is already taken", async (t) => {
    // The first 8 random picks are "B" (alphabet index 0), so the first code is ckBBBB and the
    // second affiliate's first try collides with it; later picks are "C".
    let pickCount = 0;
    t.mock.method(crypto, "randomInt", () => (pickCount++ < 8 ? 0 : 1));

    const cashKaro = await seedAffiliate({ name: "CashKaro" });
    const cashKart = await seedAffiliate({ name: "Cash Kart" });

    assert.equal(cashKaro.code, "ckBBBB");
    assert.equal(cashKart.code, "ckCCCC");
  });

  it("gives up with 500 after 5 taken codes instead of trying forever", async (t) => {
    t.mock.method(crypto, "randomInt", () => 0); // every code is ckBBBB
    t.mock.method(console, "error", () => {}); // the 500 is logged; keep test output clean
    await seedAffiliate({ name: "CashKaro" });

    const res = await postAffiliate({
      name: "Cash Kart",
      defaultCommissionRatePercent: 6,
    });

    assertProblem(res, 500, "INTERNAL_ERROR");
    assert.equal(crypto.randomInt.mock.callCount(), 4 + 5 * 4);
  });

  it("rejects a missing name and commission, listing both", async () => {
    const res = await postAffiliate({});

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.deepEqual(getFieldErrors(res), {
      name: "Required.",
      defaultCommissionRatePercent: "Required.",
    });
  });

  it("rejects a commission that is not above 0, at most 100, with up to 2 decimals", async () => {
    for (const rate of [0, -1, 100.5, 6.333, "6", null]) {
      const res = await postAffiliate({
        name: "CashKaro",
        defaultCommissionRatePercent: rate,
      });

      assertProblem(res, 400, "VALIDATION_FAILED");
      assert.equal(
        getFieldErrors(res).defaultCommissionRatePercent,
        "Must be a number above 0 and at most 100, with up to 2 decimals.",
        `rate ${rate}`,
      );
    }
  });

  it("rejects a contract window that is not a whole number from 1 to 60", async () => {
    for (const days of [0, 61, 7.5, "14"]) {
      const res = await postAffiliate({
        name: "CashKaro",
        defaultCommissionRatePercent: 6,
        defaultContractWindowDays: days,
      });

      assertProblem(res, 400, "VALIDATION_FAILED");
      assert.equal(
        getFieldErrors(res).defaultContractWindowDays,
        "Must be a whole number from 1 to 60.",
        `days ${days}`,
      );
    }
  });

  it("rejects an invalid email", async () => {
    const res = await postAffiliate({
      name: "CashKaro",
      defaultCommissionRatePercent: 6,
      contactEmail: "ops-at-cashkaro.com",
    });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.equal(
      getFieldErrors(res).contactEmail,
      "Must be a valid email address.",
    );
  });

  it("rejects a code, an id, a status and unknown fields, because the server sets them", async () => {
    const res = await postAffiliate({
      name: "CashKaro",
      defaultCommissionRatePercent: 6,
      id: crypto.randomUUID(),
      code: "ckAB14",
      status: "paused",
      postbackUrl: "https://cashkaro.com/postback",
    });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.deepEqual(getFieldErrors(res), {
      id: "id is generated by the server.",
      code: "code is generated by the server.",
      status:
        "A new affiliate is always active; pause it afterwards with PATCH.",
      postbackUrl: "Unknown field.",
    });
  });

  it("rejects a name that already exists in another letter case: 409 AFFILIATE_NAME_TAKEN", async () => {
    await seedAffiliate({ name: "CashKaro" });

    const res = await postAffiliate({
      name: "CASHKARO",
      defaultCommissionRatePercent: 6,
    });

    assertProblem(res, 409, "AFFILIATE_NAME_TAKEN");
  });
});

describe("GET /api/v1/affiliates", () => {
  it("lists affiliates by name, and filters by search text and status", async () => {
    await seedAffiliate({ name: "Wishlink" });
    await seedAffiliate({ name: "CashKaro" });
    await seedAffiliate({ name: "EarnKaro" });
    const admitad = await seedAffiliate({ name: "Admitad" });
    await patchAffiliate(admitad.id, { status: "paused" });

    const all = await api.get(BASE_URL);
    const searched = await api.get(BASE_URL).query({ search: "KARO" });
    const paused = await api.get(BASE_URL).query({ status: "paused" });
    const activeKaro = await api
      .get(BASE_URL)
      .query({ search: "karo", status: "active", limit: 1, page: 2 });

    assert.equal(all.status, 200);
    assert.deepEqual(getAffiliateNames(all), [
      "Admitad",
      "CashKaro",
      "EarnKaro",
      "Wishlink",
    ]);
    assert.deepEqual(getAffiliateNames(searched), ["CashKaro", "EarnKaro"]);
    assert.deepEqual(getAffiliateNames(paused), ["Admitad"]);
    assert.deepEqual(getAffiliateNames(activeKaro), ["EarnKaro"]);
    assert.deepEqual(activeKaro.body.pagination, {
      page: 2,
      limit: 1,
      totalItems: 2,
      totalPages: 2,
    });
  });

  it("rejects an unknown status and unknown query parameters", async () => {
    const badStatus = await api.get(`${BASE_URL}?status=deleted`);
    const unknownParameter = await api.get(`${BASE_URL}?code=ck`);

    assertProblem(badStatus, 400, "VALIDATION_FAILED");
    assert.equal(getFieldErrors(badStatus).status, "Must be active or paused.");
    assertProblem(unknownParameter, 400, "VALIDATION_FAILED");
  });
});

describe("GET /api/v1/affiliates/:id", () => {
  it("returns the affiliate with its ETag", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });

    const res = await api.get(`${BASE_URL}/${createdAffiliate.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"1"');
    assert.deepEqual(res.body.data, createdAffiliate);
  });

  it("returns 404 AFFILIATE_NOT_FOUND for an unknown id, and 400 for an id that isn't a UUID", async () => {
    const unknownResponse = await api.get(
      `${BASE_URL}/${crypto.randomUUID()}`,
    );
    const invalidResponse = await api.get(`${BASE_URL}/cashkaro`);

    assertProblem(unknownResponse, 404, "AFFILIATE_NOT_FOUND");
    assertProblem(invalidResponse, 400, "VALIDATION_FAILED");
  });
});

describe("PATCH /api/v1/affiliates/:id", () => {
  it("changes details, keeps the code on a rename and increases the version", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });
    await sleep(10);

    const res = await patchAffiliate(createdAffiliate.id, {
      name: "CashKaro Partners",
      defaultCommissionRatePercent: 7.25,
      defaultContractWindowDays: 21,
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"2"');
    const updatedAffiliate = res.body.data;
    assert.equal(updatedAffiliate.id, createdAffiliate.id);
    assert.equal(updatedAffiliate.code, createdAffiliate.code);
    assert.equal(updatedAffiliate.name, "CashKaro Partners");
    assert.equal(updatedAffiliate.defaultCommissionRatePercent, 7.25);
    assert.equal(updatedAffiliate.defaultContractWindowDays, 21);
    assert.equal(updatedAffiliate.currentVersionNo, 2);
    assert.ok(
      Date.parse(updatedAffiliate.updatedAt) >
        Date.parse(createdAffiliate.updatedAt),
    );
  });

  it("pauses and resumes an affiliate through its status", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });

    const pauseResponse = await patchAffiliate(createdAffiliate.id, {
      status: "paused",
    });
    const resumeResponse = await api
      .patch(`${BASE_URL}/${createdAffiliate.id}`)
      .set("If-Match", '"2"')
      .send({ status: "active" });

    assert.equal(pauseResponse.status, 200);
    assert.equal(pauseResponse.body.data.status, "paused");
    assert.equal(pauseResponse.body.data.currentVersionNo, 2);
    assert.equal(resumeResponse.status, 200);
    assert.equal(resumeResponse.body.data.status, "active");
    assert.equal(resumeResponse.body.data.currentVersionNo, 3);
    assert.equal(resumeResponse.body.data.code, createdAffiliate.code);
  });

  it("removes the contact email with null", async () => {
    const createdAffiliate = await seedAffiliate({
      name: "CashKaro",
      contactEmail: "ops@cashkaro.com",
    });

    const res = await patchAffiliate(createdAffiliate.id, {
      contactEmail: null,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.contactEmail, null);
  });

  it("refuses to change the code, an unknown status and an empty body", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });

    const codeResponse = await patchAffiliate(createdAffiliate.id, {
      code: "ckZZZZ",
    });
    const statusResponse = await patchAffiliate(createdAffiliate.id, {
      status: "deleted",
    });
    const emptyResponse = await patchAffiliate(createdAffiliate.id, {});

    assertProblem(codeResponse, 400, "VALIDATION_FAILED");
    assert.equal(getFieldErrors(codeResponse).code, "code cannot be changed.");
    assert.equal(
      getFieldErrors(statusResponse).status,
      "Must be active or paused.",
    );
    assert.equal(
      getFieldErrors(emptyResponse).body,
      "Send at least one field to change: name, contactEmail, defaultCommissionRatePercent, defaultContractWindowDays or status.",
    );
  });

  it("refuses a stale If-Match with 412 VERSION_MISMATCH and changes nothing", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });
    await patchAffiliate(createdAffiliate.id, { status: "paused" }); // now version 2

    const res = await api
      .patch(`${BASE_URL}/${createdAffiliate.id}`)
      .set("If-Match", '"1"')
      .send({ status: "active" });

    assertProblem(res, 412, "VERSION_MISMATCH");
    const currentResponse = await api.get(
      `${BASE_URL}/${createdAffiliate.id}`,
    );
    assert.equal(currentResponse.body.data.status, "paused");
  });

  it("rejects a name another affiliate has (409), and an unknown affiliate (404)", async () => {
    await seedAffiliate({ name: "CashKaro" });
    const admitad = await seedAffiliate({ name: "Admitad" });

    const clashResponse = await patchAffiliate(admitad.id, {
      name: "cashkaro",
    });
    const unknownResponse = await patchAffiliate(crypto.randomUUID(), {
      status: "paused",
    });

    assertProblem(clashResponse, 409, "AFFILIATE_NAME_TAKEN");
    assertProblem(unknownResponse, 404, "AFFILIATE_NOT_FOUND");
  });
});

describe("DELETE /api/v1/affiliates/:id", () => {
  it("deletes an unused affiliate, paused or not: 204, then it's gone", async () => {
    const activeAffiliate = await seedAffiliate({ name: "CashKaro" });
    const pausedAffiliate = await seedAffiliate({ name: "Admitad" });
    await patchAffiliate(pausedAffiliate.id, { status: "paused" });

    const activeResponse = await api.delete(
      `${BASE_URL}/${activeAffiliate.id}`,
    );
    const pausedResponse = await api.delete(
      `${BASE_URL}/${pausedAffiliate.id}`,
    );

    assert.equal(activeResponse.status, 204);
    assert.equal(pausedResponse.status, 204);
    assertProblem(
      await api.get(`${BASE_URL}/${activeAffiliate.id}`),
      404,
      "AFFILIATE_NOT_FOUND",
    );
  });

  it("refuses to delete an affiliate a campaign has: 409 AFFILIATE_IN_USE", async () => {
    const usedAffiliate = await seedAffiliate({ name: "CashKaro" });
    const unusedAffiliate = await seedAffiliate({ name: "Admitad" });
    await seedCampaignWithAffiliate(usedAffiliate.id);

    const usedResponse = await api.delete(
      `${BASE_URL}/${usedAffiliate.id}`,
    );
    const unusedResponse = await api.delete(
      `${BASE_URL}/${unusedAffiliate.id}`,
    );

    assertProblem(usedResponse, 409, "AFFILIATE_IN_USE");
    assert.match(usedResponse.body.detail, /"CashKaro"/);
    assert.equal(
      (await api.get(`${BASE_URL}/${usedAffiliate.id}`)).status,
      200,
    );
    assert.equal(unusedResponse.status, 204);
  });

  it("refuses a stale If-Match with 412 and keeps the affiliate", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });
    await patchAffiliate(createdAffiliate.id, { status: "paused" }); // now version 2

    const res = await api
      .delete(`${BASE_URL}/${createdAffiliate.id}`)
      .set("If-Match", '"1"');

    assertProblem(res, 412, "VERSION_MISMATCH");
    assert.equal(
      (await api.get(`${BASE_URL}/${createdAffiliate.id}`)).status,
      200,
    );
  });
});

describe("Unsupported requests", () => {
  it("returns 405 METHOD_NOT_ALLOWED with an Allow header", async () => {
    const createdAffiliate = await seedAffiliate({ name: "CashKaro" });

    const putResponse = await api
      .put(`${BASE_URL}/${createdAffiliate.id}`)
      .send({ name: "Admitad" });
    const pauseActionResponse = await api.post(
      `${BASE_URL}/${createdAffiliate.id}`,
    );

    assertProblem(putResponse, 405, "METHOD_NOT_ALLOWED");
    assert.equal(putResponse.headers.allow, "GET, PATCH, DELETE");
    assertProblem(pauseActionResponse, 405, "METHOD_NOT_ALLOWED");
  });
});
