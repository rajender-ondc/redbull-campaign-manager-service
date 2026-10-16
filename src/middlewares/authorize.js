"use strict";

const { ApiError } = require("../errors/ApiError");

/**
 * Creates middleware that lets a request through only if the signed-in user has one of these roles
 * (PRD S5-01: an admin writes, a general user reads). Use it after authenticate.
 * @param {...string} allowedRoles e.g. "admin"
 */
function authorize(...allowedRoles) {
  return function authorizeRole(req, _res, next) {
    if (!allowedRoles.includes(req.user?.role)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Your role doesn't allow this. Ask an admin.",
      );
    }
    next();
  };
}

module.exports = { authorize };
