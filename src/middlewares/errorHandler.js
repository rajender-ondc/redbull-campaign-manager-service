"use strict";

const { STATUS_CODES } = require("node:http");
const { ApiError } = require("../errors/ApiError");

// Errors from express.json() (body-parser) carry a `type`; these are the ones a client can cause.
const BODY_PARSER_ERRORS = {
  "entity.parse.failed": {
    status: 400,
    code: "MALFORMED_JSON",
    detail: "The request body is not valid JSON.",
  },
  "entity.too.large": {
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    detail: "The request body is larger than 100 KB.",
  },
  "encoding.unsupported": {
    status: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    detail: "The request body encoding is not supported.",
  },
  "charset.unsupported": {
    status: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    detail: "The request body charset is not supported.",
  },
};

// Error names the MongoDB driver and Mongoose use when the database can't be reached.
const DATABASE_UNAVAILABLE_ERRORS = new Set([
  "MongoServerSelectionError",
  "MongooseServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoNotConnectedError",
]);

/** Express handler for URLs that match no route. Mount it after all routers. */
function handleNotFound(req, _res, next) {
  next(
    new ApiError(
      404,
      "ROUTE_NOT_FOUND",
      `There is no ${req.method} ${req.path} endpoint.`,
    ),
  );
}

/**
 * Creates a handler for HTTP methods a path doesn't support (RFC 9110 §15.5.6).
 * @param {string[]} allowedMethods The methods the path does support, e.g. ['GET', 'POST'].
 */
function createMethodNotAllowedHandler(allowedMethods) {
  const allowHeader = allowedMethods.join(", ");
  return function handleMethodNotAllowed(req, res, next) {
    res.set("Allow", allowHeader);
    next(
      new ApiError(
        405,
        "METHOD_NOT_ALLOWED",
        `${req.method} is not supported here. Use ${allowHeader}.`,
      ),
    );
  };
}

/**
 * The single place that turns any error into an RFC 9457 Problem Details response.
 * Expected errors (ApiError, bad request bodies, database outages) keep their meaning.
 * Anything else becomes a 500 with no internal details. Every 5xx is logged with the request.
 */
function handleError(err, req, res, next) {
  if (res.headersSent) {
    // Too late to send an error body; let Express close the connection.
    return next(err);
  }

  const apiError =
    transformToApiError(err) ??
    new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  if (apiError.status >= 500) {
    console.error(
      "%s %s failed with %d:",
      req.method,
      req.originalUrl,
      apiError.status,
      err,
    );
  }

  if (apiError.headers) {
    res.set(apiError.headers);
  }
  res
    .status(apiError.status)
    .type("application/problem+json")
    .json(formatProblemDetails(apiError, req));
}

/** Maps known error kinds to an ApiError; returns null for anything unexpected. */
function transformToApiError(err) {
  if (err instanceof ApiError) {
    return err;
  }
  const bodyParserError = BODY_PARSER_ERRORS[err.type];
  if (bodyParserError) {
    return new ApiError(
      bodyParserError.status,
      bodyParserError.code,
      bodyParserError.detail,
    );
  }
  if (DATABASE_UNAVAILABLE_ERRORS.has(err.name)) {
    return new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "The service is temporarily unavailable. Please retry shortly.",
    );
  }
  return null;
}

function formatProblemDetails(apiError, req) {
  const problemDetails = {
    type: `/problems/${apiError.code.toLowerCase().replaceAll("_", "-")}`,
    title: STATUS_CODES[apiError.status] ?? "Error",
    status: apiError.status,
    code: apiError.code,
    detail: apiError.message,
    instance: req.originalUrl.split("?")[0],
  };
  if (apiError.errors?.length) {
    problemDetails.errors = apiError.errors;
  }
  return problemDetails;
}

module.exports = { handleError, handleNotFound, createMethodNotAllowedHandler };
