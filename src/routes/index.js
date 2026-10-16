"use strict";

const express = require("express");
const authRouter = require("./auth.routes");
const userRouter = require("./user.routes");
const categoryRouter = require("./category.routes");
const channelRouter = require("./channel.routes");
const affiliateRouter = require("./affiliate.routes");
const { authenticate } = require("../middlewares/authenticate");

// Every API resource, mounted under /api/v1 by app.js. A new resource adds one line here.
const apiRouter = express.Router();

// Logging in and forgot password are public (ADR-015); logout checks its token itself (ADR-016).
apiRouter.use("/auth", authRouter);

// Everything below needs a valid login token. Writes are limited to admins inside each router.
apiRouter.use(authenticate);
apiRouter.use("/users", userRouter);
apiRouter.use("/categories", categoryRouter);
apiRouter.use("/channels", channelRouter);
apiRouter.use("/affiliates", affiliateRouter);

module.exports = apiRouter;
