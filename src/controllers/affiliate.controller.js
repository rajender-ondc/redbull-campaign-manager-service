"use strict";

const affiliateService = require("../services/affiliate.service");
const { sendCreated, sendResource, sendPage } = require("../utils/response");

// Controllers only translate HTTP to service calls and back. Input was already validated and
// cleaned by the validate() middleware (see routes), and errors go to the central error handler.

async function handleCreateAffiliate(req, res) {
  const affiliate = await affiliateService.createAffiliate(
    req.validatedInput.body,
  );
  sendCreated(req, res, affiliate);
}

async function handleGetAffiliates(req, res) {
  const listRequest = req.validatedInput.query;
  const affiliatePage = await affiliateService.getAffiliates(listRequest);
  sendPage(res, affiliatePage, listRequest);
}

async function handleGetAffiliate(req, res) {
  const affiliate = await affiliateService.getAffiliate(
    req.validatedInput.params.id,
  );
  sendResource(res, affiliate);
}

async function handleUpdateAffiliate(req, res) {
  const { params, headers, body } = req.validatedInput;
  const affiliate = await affiliateService.updateAffiliate(
    params.id,
    body,
    headers.expectedVersion,
  );
  sendResource(res, affiliate);
}

async function handleDeleteAffiliate(req, res) {
  const { params, headers } = req.validatedInput;
  await affiliateService.deleteAffiliate(params.id, headers.expectedVersion);
  res.status(204).end();
}

module.exports = {
  handleCreateAffiliate,
  handleGetAffiliates,
  handleGetAffiliate,
  handleUpdateAffiliate,
  handleDeleteAffiliate,
};
