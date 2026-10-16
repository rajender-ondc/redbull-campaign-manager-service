"use strict";

const { existsSync } = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

/** Optional .env file at the project root. Variables already set in the real environment always win. */
const ENV_FILE_PATH = path.resolve(__dirname, "..", "..", ".env");
const PORT_MESSAGE = "must be a whole number from 1 to 65535";
const JWT_SECRET_KEY_MESSAGE =
  "must be set: S1's RSA private key in PEM format, on one line with \\n between its lines (see README)";
const TTL_MESSAGE = "must be set to a whole number of minutes from 5 to 1440";

/** A setting that must be present and not blank. */
const buildRequiredTextSchema = (message) =>
  z.string({ error: message }).trim().min(1, { error: message });

// Every environment variable the service reads, with its rules and defaults.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"], {
      error: "must be development, test or production",
    })
    .default("development"),
  PORT: z.coerce
    .number({ error: PORT_MESSAGE })
    .int({ error: PORT_MESSAGE })
    .min(1, { error: PORT_MESSAGE })
    .max(65535, { error: PORT_MESSAGE })
    .default(3000),
  MONGODB_URI: z
    .string({ error: "is required" })
    .regex(/^mongodb(\+srv)?:\/\//, {
      error: "must start with mongodb:// or mongodb+srv://",
    })
    // Without a database name MongoDB silently uses a database called "test".
    .regex(/^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/, {
      error:
        "must include the database name, e.g. mongodb://127.0.0.1:27017/campaign_manager",
    }),
  // Login tokens (ADR-015): S1 signs them with this RSA private key, which never leaves S1. The JWT
  // settings have no defaults: .env is the one place they're set. Where a value can't span lines,
  // the key's line breaks arrive as the two characters \n, so they're turned back into line breaks.
  JWT_SECRET_KEY: buildRequiredTextSchema(JWT_SECRET_KEY_MESSAGE).transform(
    (pem) => pem.replaceAll("\\n", "\n").trim(),
  ),
  JWT_ISSUER: buildRequiredTextSchema(
    "must be set: who issues the tokens (the iss claim), e.g. redbull-auth",
  ),
  JWT_AUDIENCE: buildRequiredTextSchema(
    "must be set: which APIs the tokens are for (the aud claim), e.g. redbull-api",
  ),
  // Provisional: the final lifetime is decided with the cross-service work (ADR-015).
  ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number({ error: TTL_MESSAGE })
    .int({ error: TTL_MESSAGE })
    .min(5, { error: TTL_MESSAGE })
    .max(1440, { error: TTL_MESSAGE }),
});

/**
 * Loads `.env` (if present) into process.env, then reads and validates the configuration.
 *
 * @returns {Readonly<{ NODE_ENV: string, PORT: number, MONGODB_URI: string, JWT_SECRET_KEY: string,
 *   JWT_ISSUER: string, JWT_AUDIENCE: string, ACCESS_TOKEN_TTL_MINUTES: number }>}
 */
function loadEnv() {
  if (existsSync(ENV_FILE_PATH)) {
    process.loadEnvFile(ENV_FILE_PATH);
  }
  return parseEnv(process.env);
}

/**
 * Validates the environment variables and returns the configuration. Throws an error listing every
 * invalid variable, so a misconfigured service fails at start-up instead of on the first request.
 * The error names the variables but never shows their values, so the signing key can't reach a log.
 *
 * @param {Record<string, string | undefined>} variables Usually process.env.
 * @returns {ReturnType<typeof loadEnv>}
 */
function parseEnv(variables) {
  const result = envSchema.safeParse(variables);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")} ${issue.message}`,
    );
    throw new Error(
      `Invalid environment configuration: ${problems.join("; ")}`,
    );
  }
  return Object.freeze(result.data);
}

module.exports = { loadEnv, parseEnv };
