"use strict";

// Creates the first admin account, once, at go-live (ADR-015):
//   npm run create-admin -- --email admin@ondc.org --name "Asha Rao"
// It prints a random password once. Give it to the admin, who can change it after logging in.
// Refused if an active admin already exists: more users are created through the API.

const { parseArgs } = require("node:util");
const { loadEnv } = require("../src/config/env");
const {
  connectDatabase,
  disconnectDatabase,
} = require("../src/config/database");
const userService = require("../src/services/user.service");
const { createUserRequestSchema } = require("../src/validators/user.validator");

const USAGE = 'Usage: npm run create-admin -- --email <email> --name "<name>"';

async function createAdmin() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  // The same email and name rules as POST /api/v1/users; the password is generated below.
  const adminInput = createUserRequestSchema.body
    .pick({ email: true, name: true })
    .safeParse(values);
  if (!adminInput.success) {
    const problems = adminInput.error.issues.map(
      (issue) => `--${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`${problems.join(" ")}\n${USAGE}`);
  }

  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);
  try {
    const { admin, password } = await userService.createFirstAdmin(
      adminInput.data,
    );
    console.info(`Created admin ${admin.name} <${admin.email}>.`);
    console.info(`Password (shown only now): ${password}`);
    console.info(
      "Share it securely; the admin can change it after logging in (PUT /api/v1/users/me/password).",
    );
  } finally {
    await disconnectDatabase();
  }
}

createAdmin().catch((err) => {
  console.error(`Could not create the admin: ${err.message}`);
  process.exitCode = 1;
});
