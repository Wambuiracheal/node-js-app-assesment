'use strict';

// This module builds and wires together the services used by the application.  
const logger = require('./lib/logger');
const { createEventPublisher } = require('./messaging');
const { createAccountsService } = require('./modules/accounts/accounts.service');
const { createAuthService } = require('./modules/auth/auth.service');
const { createTransfersService } = require('./modules/transfers/transfers.service');
const { createMpesaService } = require('./modules/mpesa/mpesa.service');

function buildServices({ db, broker, mpesaClient }) {
  const events = createEventPublisher(broker, logger);
  const accountsService = createAccountsService({ db });

  return {
    accountsService,
    authService: createAuthService({ db, accountsService }),
    transfersService: createTransfersService({ db, events }),
    mpesaService: createMpesaService({ db, broker, events, mpesaClient, accountsService }),
    healthService: {
      async check() {
        const [database, messageBroker] = await Promise.all([
          db.raw('select 1').then(() => 'up', () => 'down'),
          broker.isHealthy().then((ok) => (ok ? 'up' : 'down'), () => 'down'),
        ]);
        return { database, messageBroker };
      },
    },
  };
}

module.exports = { buildServices };
