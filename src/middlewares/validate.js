"use strict";

const { ApiError } = require("../errors/ApiError");

const REQUEST_PARTS = ["params", "query", "headers", "body"];

/**
 * Creates middleware that validates and cleans request input with Zod schemas before the
 * controller runs.
 *
 * Clean values are put on `req.validatedInput` (e.g. `req.validatedInput.body`), because
 * Express 5 makes `req.query` read-only. Every problem is reported at once as a 400
 * VALIDATION_FAILED with one entry per invalid field.
 *
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType,
 *           headers?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
function validate(schemas) {
  return function validateRequest(req, _res, next) {
    if (schemas.body && !req.is("application/json")) {
      throw new ApiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Send the request body as JSON with the header Content-Type: application/json.",
      );
    }

    const validatedInput = {};
    const fieldErrors = [];
    for (const part of REQUEST_PARTS) {
      if (!schemas[part]) {
        continue;
      }
      const result = schemas[part].safeParse(req[part]);
      if (result.success) {
        validatedInput[part] = result.data;
      } else {
        fieldErrors.push(
          ...result.error.issues.flatMap((issue) =>
            formatFieldErrors(issue, part),
          ),
        );
      }
    }

    if (fieldErrors.length > 0) {
      const summary =
        fieldErrors.length === 1
          ? "1 invalid field."
          : `${fieldErrors.length} invalid fields.`;
      throw new ApiError(400, "VALIDATION_FAILED", summary, fieldErrors);
    }

    req.validatedInput = validatedInput;
    next();
  };
}

/** Formats one Zod issue as `{ field, message }` entries, e.g. `{ field: 'aliases.3', message: ... }`. */
function formatFieldErrors(issue, part) {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({
      field: [...issue.path, key].join("."),
      message: "Unknown field.",
    }));
  }
  return [{ field: issue.path.join(".") || part, message: issue.message }];
}

module.exports = { validate };
