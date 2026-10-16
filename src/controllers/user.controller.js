"use strict";

const userService = require("../services/user.service");
const authService = require("../services/auth.service");
const { sendCreated, sendResource, sendPage } = require("../utils/response");

// Controllers only translate HTTP to service calls and back. Input was already validated and
// cleaned by the validate() middleware (see routes), and errors go to the central error handler.
// `req.user` is the signed-in user, set by the authenticate middleware.

async function handleCreateUser(req, res) {
  const user = await userService.createUser(
    req.validatedInput.body,
    req.user.id,
  );
  sendCreated(req, res, user);
}

async function handleGetUsers(req, res) {
  const listRequest = req.validatedInput.query;
  const userPage = await userService.getUsers(listRequest);
  sendPage(res, userPage, listRequest);
}

async function handleGetUser(req, res) {
  const user = await userService.getUser(req.validatedInput.params.id);
  sendResource(res, user);
}

async function handleUpdateUser(req, res) {
  const { params, headers, body } = req.validatedInput;
  const user = await userService.updateUser(
    params.id,
    body,
    headers.expectedVersion,
  );
  sendResource(res, user);
}

async function handleGetCurrentUser(req, res) {
  sendResource(res, await userService.getUser(req.user.id));
}

async function handleChangeOwnPassword(req, res) {
  const { currentPassword, newPassword } = req.validatedInput.body;
  await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.status(204).end();
}

module.exports = {
  handleCreateUser,
  handleGetUsers,
  handleGetUser,
  handleUpdateUser,
  handleGetCurrentUser,
  handleChangeOwnPassword,
};
