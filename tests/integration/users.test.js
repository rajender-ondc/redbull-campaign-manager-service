"use strict";

// API tests for managing users (ADR-015), against a real, throwaway, in-memory MongoDB.

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const request = require("supertest");

const { createApp } = require("../../src/app");
const userService = require("../../src/services/user.service");
const { User } = require("../../src/models/user.model");
const {
  startTestDatabase,
  clearTestDatabase,
  stopTestDatabase,
} = require("../setup/testDatabase");
const {
  UUID_PATTERN,
  assertProblem,
  getFieldErrors,
} = require("../setup/testHelpers");
const {
  createTestUser,
  createAuthorizedApi,
} = require("../setup/testAuth");

const BASE_URL = "/api/v1/users";
const NEW_USER_PASSWORD = "Welcome@2026";

const app = createApp();

before(startTestDatabase);
after(stopTestDatabase);
// Requests are sent by a signed-in admin unless a test says otherwise.
let admin;
const api = createAuthorizedApi(app, () => admin.authorization);

// Every test starts from empty collections, with a fresh admin, and creates the data it needs.
beforeEach(async () => {
  await clearTestDatabase();
  admin = await createTestUser({
    role: "admin",
    email: "admin@ondc.org",
    name: "Asha Admin",
  });
});

// ---------- helpers ----------

const postUser = (body) => api.post(BASE_URL).send(body);

async function seedUser(body) {
  const res = await postUser({
    role: "user",
    password: NEW_USER_PASSWORD,
    ...body,
  });
  assert.equal(
    res.status,
    201,
    `test setup failed: ${JSON.stringify(res.body)}`,
  );
  return res.body.data;
}

const getUserNames = (res) => res.body.data.map((user) => user.name);

// ---------- tests ----------

describe("POST /api/v1/users", () => {
  it("creates an active user the admin can share a password with: 201, no password hash", async () => {
    const res = await postUser({
      name: "  Ravi Kumar ",
      email: " Ravi@ONDC.org ",
      role: "user",
      password: NEW_USER_PASSWORD,
    });

    assert.equal(res.status, 201);
    const user = res.body.data;
    assert.match(user.id, UUID_PATTERN);
    assert.equal(res.headers.location, `${BASE_URL}/${user.id}`);
    assert.equal(res.headers.etag, '"1"');
    assert.equal(user.name, "Ravi Kumar");
    assert.equal(user.email, "ravi@ondc.org");
    assert.equal(user.role, "user");
    assert.equal(user.status, "active");
    assert.equal(user.createdBy, admin.id);
    assert.equal(user.failedAttempts, 0);
    assert.equal(user.lockedUntil, null);
    assert.equal(user.lastLoginAt, null);
    assert.ok(Date.parse(user.passwordChangedAt));
    assert.equal(user.passwordHash, undefined);

    // The person can log in straight away with the shared password.
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ravi@ondc.org", password: NEW_USER_PASSWORD });
    assert.equal(loginResponse.status, 200);
  });

  it("rejects an email that's already used, in any letter case: 409 USER_EMAIL_TAKEN", async () => {
    await seedUser({ name: "Ravi Kumar", email: "ravi@ondc.org" });

    const res = await postUser({
      name: "Ravi K",
      email: "RAVI@ondc.org",
      role: "user",
      password: NEW_USER_PASSWORD,
    });

    assertProblem(res, 409, "USER_EMAIL_TAKEN");
  });

  it("checks every field, including the password rules", async () => {
    const res = await postUser({
      email: "not-an-email",
      role: "superadmin",
      password: "password",
    });

    assertProblem(res, 400, "VALIDATION_FAILED");
    const fieldErrors = getFieldErrors(res);
    assert.equal(fieldErrors.name, "Required.");
    assert.equal(fieldErrors.email, "Must be a valid email address.");
    assert.equal(fieldErrors.role, "Must be admin or user.");
    const passwordMessages = res.body.errors
      .filter((fieldError) => fieldError.field === "password")
      .map((fieldError) => fieldError.message);
    assert.deepEqual(passwordMessages, [
      "Must contain at least one uppercase letter (A–Z).",
      "Must contain at least one digit (0–9).",
      "Must contain at least one symbol, such as @ # $ % or !.",
    ]);
  });
});

describe("GET /api/v1/users", () => {
  it("lists users by name, searching names and emails, filtering by role and status", async () => {
    await seedUser({ name: "Ravi Kumar", email: "ravi@ondc.org" });
    const meena = await seedUser({
      name: "Meena Shah",
      email: "meena.shah@ondc.org",
    });
    await seedUser({ name: "Kiran Rao", email: "kiran@ondc.org", role: "admin" });
    await api.patch(`${BASE_URL}/${meena.id}`).send({ status: "disabled" });

    const all = await api.get(BASE_URL);
    const searched = await api.get(BASE_URL).query({ search: "SHAH" });
    const admins = await api.get(BASE_URL).query({ role: "admin" });
    const disabled = await api.get(BASE_URL).query({ status: "disabled" });

    assert.equal(all.status, 200);
    assert.deepEqual(getUserNames(all), [
      "Asha Admin",
      "Kiran Rao",
      "Meena Shah",
      "Ravi Kumar",
    ]);
    assert.deepEqual(getUserNames(searched), ["Meena Shah"]);
    assert.deepEqual(getUserNames(admins), ["Asha Admin", "Kiran Rao"]);
    assert.deepEqual(getUserNames(disabled), ["Meena Shah"]);
    assert.ok(all.body.data.every((user) => user.passwordHash === undefined));
  });
});

describe("GET /api/v1/users/:id and /me", () => {
  it("returns a user with its ETag; 404 for an unknown id", async () => {
    const ravi = await seedUser({ name: "Ravi Kumar", email: "ravi@ondc.org" });

    const res = await api.get(`${BASE_URL}/${ravi.id}`);
    const unknownResponse = await api.get(`${BASE_URL}/${randomUUID()}`);

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"1"');
    assert.deepEqual(res.body.data, ravi);
    assertProblem(unknownResponse, 404, "USER_NOT_FOUND");
  });

  it("lets any signed-in user read their own profile", async () => {
    const user = await createTestUser({
      role: "user",
      email: "meena@ondc.org",
      name: "Meena Shah",
    });

    const res = await request(app)
      .get(`${BASE_URL}/me`)
      .set("Authorization", user.authorization);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, user.id);
    assert.equal(res.body.data.email, "meena@ondc.org");
    assert.equal(res.body.data.passwordHash, undefined);
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("changes a name, email, role and status", async () => {
    const ravi = await seedUser({ name: "Ravi Kumar", email: "ravi@ondc.org" });

    const res = await api
      .patch(`${BASE_URL}/${ravi.id}`)
      .set("If-Match", '"1"')
      .send({
        name: "Ravi K",
        email: "ravi.k@ondc.org",
        role: "admin",
        status: "disabled",
      });

    assert.equal(res.status, 200);
    assert.equal(res.headers.etag, '"2"');
    assert.equal(res.body.data.name, "Ravi K");
    assert.equal(res.body.data.email, "ravi.k@ondc.org");
    assert.equal(res.body.data.role, "admin");
    assert.equal(res.body.data.status, "disabled");
  });

  it("never leaves the system without an active admin: 409 LAST_ADMIN", async () => {
    const demoteResponse = await api
      .patch(`${BASE_URL}/${admin.id}`)
      .send({ role: "user" });
    const disableResponse = await api
      .patch(`${BASE_URL}/${admin.id}`)
      .send({ status: "disabled" });
    await seedUser({ name: "Kiran Rao", email: "kiran@ondc.org", role: "admin" });
    const allowedResponse = await api
      .patch(`${BASE_URL}/${admin.id}`)
      .send({ role: "user" });

    assertProblem(demoteResponse, 409, "LAST_ADMIN");
    assertProblem(disableResponse, 409, "LAST_ADMIN");
    assert.equal(allowedResponse.status, 200);
  });

  it("rejects an email another user has (409) and a password change (400)", async () => {
    await seedUser({ name: "Ravi Kumar", email: "ravi@ondc.org" });
    const meena = await seedUser({ name: "Meena Shah", email: "meena@ondc.org" });

    const emailResponse = await api
      .patch(`${BASE_URL}/${meena.id}`)
      .send({ email: "RAVI@ondc.org" });
    const passwordResponse = await api
      .patch(`${BASE_URL}/${meena.id}`)
      .send({ password: "Other#Pass1" });

    assertProblem(emailResponse, 409, "USER_EMAIL_TAKEN");
    assertProblem(passwordResponse, 400, "VALIDATION_FAILED");
    assert.equal(getFieldErrors(passwordResponse).password, "Unknown field.");
  });

  it("stops a disabled user from logging in", async () => {
    const ravi = await seedUser({ name: "Ravi Kumar", email: "ravi@ondc.org" });

    await api.patch(`${BASE_URL}/${ravi.id}`).send({ status: "disabled" });
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ravi@ondc.org", password: NEW_USER_PASSWORD });

    assertProblem(loginResponse, 401, "INVALID_CREDENTIALS");
  });
});

describe("Who may manage users", () => {
  it("lets only admins list, read, create and change users: 403 for a user", async () => {
    const user = await createTestUser({ role: "user" });
    const asUser = createAuthorizedApi(app, () => user.authorization);

    const responses = [
      await asUser.get(BASE_URL),
      await asUser.get(`${BASE_URL}/${admin.id}`),
      await asUser.post(BASE_URL).send({
        name: "Ravi Kumar",
        email: "ravi@ondc.org",
        role: "admin",
        password: NEW_USER_PASSWORD,
      }),
      await asUser.patch(`${BASE_URL}/${user.id}`).send({ role: "admin" }),
    ];

    for (const res of responses) {
      assertProblem(res, 403, "FORBIDDEN");
    }
  });

  it("never deletes users: DELETE → 405, disable them instead", async () => {
    const res = await api.delete(`${BASE_URL}/${admin.id}`);

    assertProblem(res, 405, "METHOD_NOT_ALLOWED");
    assert.equal(res.headers.allow, "GET, PATCH");
  });
});

describe("The first admin (npm run create-admin)", () => {
  it("is created once, with a generated password that meets the rules and works", async () => {
    await User.deleteMany({});

    const { admin: firstAdmin, password } = await userService.createFirstAdmin({
      email: "owner@ondc.org",
      name: "Owner",
    });

    assert.equal(firstAdmin.role, "admin");
    assert.equal(firstAdmin.createdBy, null);
    assert.match(password, /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{16}$/);
    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "owner@ondc.org", password });
    assert.equal(loginResponse.status, 200);
    await assert.rejects(
      userService.createFirstAdmin({ email: "second@ondc.org", name: "Second" }),
      /An active admin already exists/,
    );
  });
});
