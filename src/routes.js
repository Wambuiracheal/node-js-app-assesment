'use strict';

const { Router } = require('express');
const { authenticate } = require('./middleware/auth');
const { asyncHandler } = require('./middleware/error-handler');
const { createAuthRouter } = require('./modules/auth/auth.routes');
const { createAccountsRouter } = require('./modules/accounts/accounts.routes');
const { createTransfersRouter } = require('./modules/transfers/transfers.routes');
const { createMpesaRouter } = require('./modules/mpesa/mpesa.routes');

// Health check router
function createHealthRouter({ healthService }) {
  const router = Router();
  router.get('/', (_req, res) => res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));
  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const checks = await healthService.check();
      const ready = Object.values(checks).every((state) => state === 'up');
      res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', checks });
    }),
  );
  return router;
}

// API router with authentication and authorization
function createApiRouter(services) {
  const router = Router();
  router.use('/auth', createAuthRouter(services));
  router.use('/accounts', authenticate, createAccountsRouter(services));
  router.use('/transfers', authenticate, createTransfersRouter(services));
  router.use('/mpesa', createMpesaRouter(services)); 
  return router;
}

module.exports = { createApiRouter, createHealthRouter };
