'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const config = require('./config');
const { buildServices } = require('./container');
const { createApiRouter, createHealthRouter } = require('./routes');
const { requestContext, requestLogger } = require('./middleware/request-context');
const { requireJson } = require('./middleware/validate');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const openApiDocument = YAML.parse(fs.readFileSync(path.join(__dirname, 'docs', 'openapi.yaml'), 'utf8'));

function createApp({ db, broker, mpesaClient }) {
  const services = buildServices({ db, broker, mpesaClient });
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(requestLogger);

  // API docs are mounted before helmet's strict CSP, which would block Swagger UI's assets.
  app.get('/docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Payments API docs' }));

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(requireJson);
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', createHealthRouter(services));
  app.use('/api/v1', createApiRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, services };
}

module.exports = { createApp };
