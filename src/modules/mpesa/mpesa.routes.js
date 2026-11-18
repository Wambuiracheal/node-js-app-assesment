'use strict';

const crypto = require('node:crypto');
const { Router } = require('express');
const config = require('../../config');
const schemas = require('./mpesa.schemas');
const logger = require('../../lib/logger');
const { Errors } = require('../../lib/errors');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error-handler');

/**
 * Daraja callbacks carry no customer JWT, so the callback endpoint is protected
 * by a shared secret (constant-time compared). In production this would be
 * combined with Safaricom IP allow-listing at the gateway.
 */
function verifyCallbackToken(req, _res, next) {
  const supplied = Buffer.from(req.get('x-callback-token') ?? '');
  const expected = Buffer.from(config.mpesa.callbackToken);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    logger.warn('Rejected M-Pesa callback with invalid token', { ip: req.ip });
    return next(Errors.unauthorized('Invalid callback token'));
  }
  return next();
}

function createMpesaRouter({ mpesaService }) {
  const router = Router();

  router.post(
    '/callback',
    verifyCallbackToken,
    validate({ body: schemas.stkCallback }),
    asyncHandler(async (req, res) => {
      await mpesaService.acceptCallback(req.valid.body);
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }),
  );

  router.post(
    '/deposits',
    authenticate,
    validate({ body: schemas.initiateDeposit }),
    asyncHandler(async (req, res) => {
      const deposit = await mpesaService.initiateDeposit(req.user, req.valid.body);
      res
        .status(202)
        .location(`${req.baseUrl}/deposits/${deposit.checkoutRequestId}`)
        .json({ data: deposit });
    }),
  );

  router.get(
    '/deposits/:checkoutRequestId',
    authenticate,
    validate({ params: schemas.depositParams }),
    asyncHandler(async (req, res) => {
      res.json({ data: await mpesaService.getDeposit(req.user, req.valid.params.checkoutRequestId) });
    }),
  );

  return router;
}

module.exports = { createMpesaRouter };
