'use strict';

const { Router } = require('express');
const schemas = require('./accounts.schemas');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../middleware/error-handler');

function createAccountsRouter({ accountsService }) {
  const router = Router();

  //create a new account
  router.post(
    '/',
    validate({ body: schemas.openAccount }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: await accountsService.open(req.user, req.valid.body) });
    }),
  );

  router.get(
    '/',
    validate({ body: schemas.openAccount }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: await accountsService.list(req.user) });
    }),
  );

  router.get(
    '/:accountNumber',
    validate({ params: schemas.accountParams }),
    asyncHandler(async (req, res) => {
      res.json({ data: await accountsService.get(req.user, req.valid.params.accountNumber) });
    }),
  );

  router.get(
    '/:accountNumber/balance',
    validate({ params: schemas.accountParams }),
    asyncHandler(async (req, res) => {
      res.json({ data: await accountsService.getBalance(req.user, req.valid.params.accountNumber) });
    }),
  );

  router.get(
    '/:accountNumber/transactions',
    validate({ params: schemas.accountParams, query: schemas.statementQuery }),
    asyncHandler(async (req, res) => {
      res.json(await accountsService.getStatement(req.user, req.valid.params.accountNumber, req.valid.query));
    }),
  );

  return router;
}

module.exports = { createAccountsRouter };
