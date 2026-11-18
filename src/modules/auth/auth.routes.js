'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const schemas = require('./auth.schemas');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error-handler');

// Brute-force protection for credential endpoints. 
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.auth.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, please try again later' } },
});

function createAuthRouter({ authService }) {
  const router = Router();

  router.post(
    '/register',
    credentialLimiter,
    validate({ body: schemas.register }),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: await authService.register(req.valid.body) });
    }),
  );

  router.post(
    '/login',
    credentialLimiter,
    validate({ body: schemas.login }),
    asyncHandler(async (req, res) => {
      res.json({ data: await authService.login(req.valid.body) });
    }),
  );

  router.get(
    '/me',
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ data: await authService.getProfile(req.user.id) });
    }),
  );

  return router;
}

module.exports = { createAuthRouter };
