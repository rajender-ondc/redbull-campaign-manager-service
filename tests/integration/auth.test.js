"use strict";

// API tests for logging in, logging out, forgot password, changing your own password and access
// control (ADR-015, ADR-016), against a real, throwaway, in-memory MongoDB and a throwaway signing key.

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const { createApp } = require("../../src/app");
const authService = require("../../src/services/auth.service");
const { User } = require("../../src/models/user.model");
const { RevokedToken } = require("../../src/models/revokedToken.model");
const {
  startTestDatabase,
  clearTestDatabase,
  stopTestDatabase,
} = require("../setup/testDatabase");
const { assertProblem, getFieldErrors, sleep } = require("../setup/testHelpers");
const {
  TEST_PASSWORD,
  publicKey,
  createTestUser,
  signTestToken,
} = require("../setup/testAuth");

const LOGIN_URL = "/api/v1/auth/login";
const LOGOUT_URL = "/api/v1/auth/logout";
const FORGOT_PASSWORD_URL = "/api/v1/auth/forgot-password";
const CHANGE_PASSWORD_URL = "/api/v1/users/me/password";
/** Any protected endpoint will do; categories are the simplest. */
const PROTECTED_URL = "/api/v1/categories";
const NEW_PASSWORD = "Changed#2026";

const app = createApp();

before(startTestDatabase);
after(stopTestDatabase);
// Every test starts from empty collections and creates the users it needs.
beforeEach(clearTestDatabase);

// ---------- helpers ----------

const logIn = (email, password) =>
  request(app).post(LOGIN_URL).send({ email, password });

/**
 * Logs out the session of the given token.
 * @param {string} authorization - The full header value: "Bearer <token>".
 */
const logOut = (authorization) =>
  request(app).post(LOGOUT_URL).set("Authorization", authorization);

/**
 * Reads a token's claims without checking it, to compare them with what S1 stored.
 * @param {string} authorization - The full header value: "Bearer <token>".
 * @returns {{ sub: string, jti: string, exp: number }} The token's claims.
 */
const decodeToken = (authorization) =>
  jwt.decode(authorization.slice("Bearer ".length));

const getProtected = (authorization) =>
  request(app).get(PROTECTED_URL).set("Authorization", authorization);

/** Tokens hold whole seconds, so wait until a token issued now is older than a password change. */
const waitForNextSecond = () => sleep(1100);

async function getStoredUser(email) {
  return User.findOne({ email }).lean();
}

// ---------- tests ----------

describe("POST /api/v1/auth/login", () => {
  it("returns an RS256 token that the public key alone can verify, and that's never cached", async () => {
    const user = await createTestUser({
      role: "user",
      email: "asha@ondc.org",
    });

    const res = await logIn("  Asha@ONDC.org ", TEST_PASSWORD);

    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers.pragma, "no-cache");
    const { accessToken, tokenType, expiresIn } = res.body.data;
    assert.equal(tokenType, "Bearer");
    assert.equal(expiresIn, 3600);
    const { header } = jwt.decode(accessToken, { complete: true });
    assert.equal(header.alg, "RS256");
    assert.ok(header.kid);
    // What S2–S4 will do later: verify with the public key only, no call to S1.
    const claims = jwt.verify(accessToken, publicKey, {
      algorithms: ["RS256"],
      issuer: "redbull-auth",
      audience: "redbull-api",
    });
    assert.equal(claims.sub, user.id);
    assert.equal(claims.role, "user");
    assert.equal(claims.exp - claims.iat, 3600);
    assert.ok(claims.jti);
    assert.deepEqual(
      Object.keys(claims).sort(),
      ["aud", "exp", "iat", "iss", "jti", "role", "sub"],
      "no personal data in the token",
    );
    assert.ok((await getStoredUser("asha@ondc.org")).lastLoginAt);
  });

  it("answers a wrong password, an unknown email and a disabled account the same way", async () => {
    await createTestUser({ email: "asha@ondc.org" });
    await createTestUser({ email: "ravi@ondc.org", status: "disabled" });

    const responses = [
      await logIn("asha@ondc.org", "Wrong#Pass1"),
      await logIn("nobody@ondc.org", TEST_PASSWORD),
      await logIn("ravi@ondc.org", TEST_PASSWORD),
    ];

    for (const res of responses) {
      assertProblem(res, 401, "INVALID_CREDENTIALS");
      assert.equal(res.body.detail, "The email or password is incorrect.");
      assert.match(res.headers["www-authenticate"], /^Bearer/);
    }
  });

  it("locks the account for 15 minutes on the 5th wrong password in a row", async () => {
    await createTestUser({ email: "asha@ondc.org" });

    for (let attempt = 1; attempt <= 4; attempt++) {
      assertProblem(
        await logIn("asha@ondc.org", "Wrong#Pass1"),
        401,
        "INVALID_CREDENTIALS",
      );
    }
    const fifthAttempt = await logIn("asha@ondc.org", "Wrong#Pass1");
    const rightPasswordWhileLocked = await logIn("asha@ondc.org", TEST_PASSWORD);

    assertProblem(fifthAttempt, 423, "ACCOUNT_LOCKED");
    const retryAfterSeconds = Number(fifthAttempt.headers["retry-after"]);
    assert.ok(retryAfterSeconds > 14 * 60 && retryAfterSeconds <= 15 * 60);
    assertProblem(rightPasswordWhileLocked, 423, "ACCOUNT_LOCKED");

    // Once the 15 minutes are over, the right password works again.
    await User.updateOne(
      { email: "asha@ondc.org" },
      { $set: { lockedUntil: new Date(Date.now() - 1000) } },
    );
    assert.equal((await logIn("asha@ondc.org", TEST_PASSWORD)).status, 200);
    const storedUser = await getStoredUser("asha@ondc.org");
    assert.equal(storedUser.failedAttempts, 0);
    assert.equal(storedUser.lockedUntil, null);
  });

  it("starts counting again after a successful login", async () => {
    await createTestUser({ email: "asha@ondc.org" });

    for (let attempt = 1; attempt <= 4; attempt++) {
      await logIn("asha@ondc.org", "Wrong#Pass1");
    }
    assert.equal((await logIn("asha@ondc.org", TEST_PASSWORD)).status, 200);
    for (let attempt = 1; attempt <= 4; attempt++) {
      assertProblem(
        await logIn("asha@ondc.org", "Wrong#Pass1"),
        401,
        "INVALID_CREDENTIALS",
      );
    }
  });

  it("rejects a login without an email or password", async () => {
    const res = await request(app).post(LOGIN_URL).send({});

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.deepEqual(getFieldErrors(res), {
      email: "Required.",
      password: "Required.",
    });
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("ends this session: the token is refused afterwards, even to log out again", async () => {
    const user = await createTestUser({ role: "user" });

    const res = await logOut(user.authorization);

    assert.equal(res.status, 204);
    assertProblem(await getProtected(user.authorization), 401, "INVALID_TOKEN");
    assertProblem(await logOut(user.authorization), 401, "INVALID_TOKEN");
  });

  it("keeps the user's other sessions, and the user can log in again", async () => {
    const user = await createTestUser({ email: "asha@ondc.org" });
    const otherSessionLogin = await logIn("asha@ondc.org", TEST_PASSWORD);
    const otherSession = `Bearer ${otherSessionLogin.body.data.accessToken}`;

    await logOut(user.authorization);
    const newLogin = await logIn("asha@ondc.org", TEST_PASSWORD);

    assert.equal((await getProtected(otherSession)).status, 200);
    assert.equal(newLogin.status, 200);
    const newSession = `Bearer ${newLogin.body.data.accessToken}`;
    assert.equal((await getProtected(newSession)).status, 200);
  });

  it("keeps the logged-out token's id only until the token expires", async () => {
    const user = await createTestUser();
    const { jti, exp } = decodeToken(user.authorization);

    await logOut(user.authorization);

    const revokedTokens = await RevokedToken.find().lean();
    assert.equal(revokedTokens.length, 1);
    assert.equal(revokedTokens[0]._id.toString(), jti);
    assert.equal(revokedTokens[0].userId.toString(), user.id);
    assert.equal(revokedTokens[0].expiresAt.getTime(), exp * 1000);
    // MongoDB deletes each record once its expiresAt has passed.
    const ttlIndex = (await RevokedToken.collection.indexes()).find(
      (index) => index.key.expiresAt === 1,
    );
    assert.equal(ttlIndex.expireAfterSeconds, 0);
  });

  it("doesn't fail when the same token is logged out twice at the same moment", async () => {
    const user = await createTestUser();
    const accessToken = {
      id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    };

    await Promise.all([
      authService.logout(user.id, accessToken),
      authService.logout(user.id, accessToken),
    ]);

    assert.equal(await RevokedToken.countDocuments(), 1);
  });

  it("needs a valid token: 401 without one, or with a broken one", async () => {
    const noTokenResponse = await request(app).post(LOGOUT_URL);
    const brokenTokenResponse = await logOut("Bearer not-a-token");

    assertProblem(noTokenResponse, 401, "AUTHENTICATION_REQUIRED");
    assertProblem(brokenTokenResponse, 401, "INVALID_TOKEN");
  });

  it("answers other methods with 405 and an Allow header", async () => {
    const res = await request(app).get(LOGOUT_URL);

    assertProblem(res, 405, "METHOD_NOT_ALLOWED");
    assert.equal(res.headers.allow, "POST");
  });
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("sets the new password, clears a lockout, and older tokens stop working", async () => {
    const user = await createTestUser({ email: "asha@ondc.org" });
    await User.updateOne(
      { email: "asha@ondc.org" },
      { $set: { lockedUntil: new Date(Date.now() + 10 * 60_000) } },
    );
    await waitForNextSecond();

    const res = await request(app)
      .post(FORGOT_PASSWORD_URL)
      .send({ email: "ASHA@ondc.org", newPassword: NEW_PASSWORD });

    assert.equal(res.status, 204);
    assertProblem(
      await logIn("asha@ondc.org", TEST_PASSWORD),
      401,
      "INVALID_CREDENTIALS",
    );
    assert.equal((await logIn("asha@ondc.org", NEW_PASSWORD)).status, 200);
    assertProblem(await getProtected(user.authorization), 401, "INVALID_TOKEN");
  });

  it("refuses an email without an active account: 404 USER_NOT_FOUND", async () => {
    await createTestUser({ email: "ravi@ondc.org", status: "disabled" });

    for (const email of ["nobody@ondc.org", "ravi@ondc.org"]) {
      const res = await request(app)
        .post(FORGOT_PASSWORD_URL)
        .send({ email, newPassword: NEW_PASSWORD });

      assertProblem(res, 404, "USER_NOT_FOUND");
    }
  });

  it("checks the password rules, with one message per rule that fails", async () => {
    await createTestUser({ email: "asha@ondc.org" });

    const res = await request(app)
      .post(FORGOT_PASSWORD_URL)
      .send({ email: "asha@ondc.org", newPassword: "abc" });

    assertProblem(res, 400, "VALIDATION_FAILED");
    const newPasswordMessages = res.body.errors
      .filter((fieldError) => fieldError.field === "newPassword")
      .map((fieldError) => fieldError.message);
    assert.deepEqual(newPasswordMessages, [
      "Must be at least 8 characters.",
      "Must contain at least one uppercase letter (A–Z).",
      "Must contain at least one digit (0–9).",
      "Must contain at least one symbol, such as @ # $ % or !.",
    ]);
  });
});

describe("PUT /api/v1/users/me/password", () => {
  it("changes your own password; the token used before the change stops working", async () => {
    const user = await createTestUser({
      role: "user",
      email: "asha@ondc.org",
    });
    await waitForNextSecond();

    const res = await request(app)
      .put(CHANGE_PASSWORD_URL)
      .set("Authorization", user.authorization)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

    assert.equal(res.status, 204);
    assertProblem(await getProtected(user.authorization), 401, "INVALID_TOKEN");
    assert.equal((await logIn("asha@ondc.org", NEW_PASSWORD)).status, 200);
  });

  it("refuses a wrong current password (400) and counts it towards the lockout", async () => {
    const user = await createTestUser({ email: "asha@ondc.org" });

    const res = await request(app)
      .put(CHANGE_PASSWORD_URL)
      .set("Authorization", user.authorization)
      .send({ currentPassword: "Wrong#Pass1", newPassword: NEW_PASSWORD });

    assertProblem(res, 400, "VALIDATION_FAILED");
    assert.equal(
      getFieldErrors(res).currentPassword,
      "Doesn't match your current password.",
    );
    assert.equal((await getStoredUser("asha@ondc.org")).failedAttempts, 1);
  });

  it("needs a token", async () => {
    const res = await request(app)
      .put(CHANGE_PASSWORD_URL)
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

    assertProblem(res, 401, "AUTHENTICATION_REQUIRED");
  });
});

describe("Access control", () => {
  it("refuses a request without a token: 401 AUTHENTICATION_REQUIRED", async () => {
    const res = await request(app).get(PROTECTED_URL);

    assertProblem(res, 401, "AUTHENTICATION_REQUIRED");
    assert.equal(res.headers["www-authenticate"], 'Bearer realm="redbull-api"');
  });

  it("refuses expired, tampered, foreign, unsigned, misaddressed and id-less tokens: 401 INVALID_TOKEN", async () => {
    const user = await createTestUser();
    const validToken = user.authorization.slice("Bearer ".length);
    const [header, , signature] = validToken.split(".");
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const { privateKey: foreignKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    const brokenTokens = {
      expired: signTestToken(
        { role: "admin" },
        { subject: user.id, expiresIn: -10 },
      ),
      tampered: `${header}.${encode({ sub: user.id, role: "admin", iat: 1, exp: 9_999_999_999, iss: "redbull-auth", aud: "redbull-api" })}.${signature}`,
      "signed by another key": signTestToken(
        { role: "admin" },
        { subject: user.id, key: foreignKey },
      ),
      'with "alg: none"': `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub: user.id, role: "admin", iss: "redbull-auth", aud: "redbull-api", exp: 9_999_999_999 })}.`,
      "for another audience": signTestToken(
        { role: "admin" },
        { subject: user.id, audience: "other-api" },
      ),
      "from another issuer": signTestToken(
        { role: "admin" },
        { subject: user.id, issuer: "someone-else" },
      ),
      // Correctly signed, but without an id (jti) it couldn't be logged out (ADR-016).
      "without an id": signTestToken({ role: "admin" }, { subject: user.id }),
      "not a JWT": "not-a-token",
    };

    for (const [description, token] of Object.entries(brokenTokens)) {
      const res = await getProtected(`Bearer ${token}`);

      assert.equal(res.status, 401, description);
      assert.equal(res.body.code, "INVALID_TOKEN", description);
      assert.match(res.headers["www-authenticate"], /error="invalid_token"/);
    }
  });

  it("refuses the token of a user who has been disabled or no longer exists", async () => {
    const disabledUser = await createTestUser({ email: "ravi@ondc.org" });
    const removedUser = await createTestUser({ email: "meena@ondc.org" });
    await User.updateOne(
      { email: "ravi@ondc.org" },
      { $set: { status: "disabled" } },
    );
    await User.deleteOne({ email: "meena@ondc.org" });

    assertProblem(
      await getProtected(disabledUser.authorization),
      401,
      "INVALID_TOKEN",
    );
    assertProblem(
      await getProtected(removedUser.authorization),
      401,
      "INVALID_TOKEN",
    );
  });

  it("lets a user read configuration but not change it: 403 FORBIDDEN", async () => {
    const admin = await createTestUser({ role: "admin" });
    const user = await createTestUser({ role: "user" });
    const createdCategory = (
      await request(app)
        .post(PROTECTED_URL)
        .set("Authorization", admin.authorization)
        .send({ name: "Grocery" })
    ).body.data;
    const categoryUrl = `${PROTECTED_URL}/${createdCategory.id}`;

    const readResponse = await getProtected(user.authorization);
    const writeResponses = [
      await request(app)
        .post(PROTECTED_URL)
        .set("Authorization", user.authorization)
        .send({ name: "Fashion" }),
      await request(app)
        .patch(categoryUrl)
        .set("Authorization", user.authorization)
        .send({ name: "Groceries" }),
      await request(app)
        .delete(categoryUrl)
        .set("Authorization", user.authorization),
      await request(app)
        .post("/api/v1/channels")
        .set("Authorization", user.authorization)
        .send({ name: "WhatsApp" }),
      await request(app)
        .post("/api/v1/affiliates")
        .set("Authorization", user.authorization)
        .send({ name: "CashKaro", defaultCommissionRatePercent: 6 }),
    ];

    assert.equal(readResponse.status, 200);
    for (const res of writeResponses) {
      assertProblem(res, 403, "FORBIDDEN");
    }
  });

  it("uses the role stored now, so a demoted admin loses admin rights at once", async () => {
    const admin = await createTestUser({
      role: "admin",
      email: "asha@ondc.org",
    });
    await User.updateOne({ email: "asha@ondc.org" }, { $set: { role: "user" } });

    const res = await request(app)
      .post(PROTECTED_URL)
      .set("Authorization", admin.authorization)
      .send({ name: "Grocery" });

    assertProblem(res, 403, "FORBIDDEN");
  });

  it("marks every API response, errors included, as not cacheable", async () => {
    const user = await createTestUser();

    const okResponse = await getProtected(user.authorization);
    const errorResponse = await request(app).get(PROTECTED_URL);

    assert.equal(okResponse.headers["cache-control"], "no-store");
    assert.equal(errorResponse.headers["cache-control"], "no-store");
  });
});
