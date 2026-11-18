'use strict';

const { Router } = require('express');
const schemas = require('./transfers.schemas');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../middleware/error-handler');

function createTransfersRouter({ transfersService }) {
  const router = Router();

  // Create a new transfer
  router.post(
    '/',
    validate({ body: schemas.createTransfer, headers: schemas.transferHeaders }),
    asyncHandler(async (req, res) => {
      const { replayed, ...result } = await transfersService.transfer(
        req.user,
        req.valid.body,
        req.valid.headers['idempotency-key'],
      );
      if (replayed) res.setHeader('Idempotent-Replayed', 'true');
      res.status(replayed ? 200 : 201).json({ data: result });
    }),
  );

  // Get a transfer by reference
  router.get(
    '/:reference',
    validate({ params: schemas.transferParams }),
    asyncHandler(async (req, res) => {
      res.json({ data: await transfersService.getByReference(req.user, req.valid.params.reference) });
    }),
  );

  return router;
}

module.exports = { createTransfersRouter };
