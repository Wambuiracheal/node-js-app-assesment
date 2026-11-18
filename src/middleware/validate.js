'use strict';

const { Errors } = require('../lib/errors');

/**
 * Validates and normalises request parts against Zod schemas.
 * Parsed (coerced, trimmed, defaulted) values are exposed on req.valid.
 *
 *   router.post('/', validate({ body: schema, params: schema, query: schema }), handler)
 */
const validate = (schemas) => (req, _res, next) => {
  const valid = {};
  const problems = [];

  for (const part of ['params', 'query', 'body', 'headers']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) {
      valid[part] = result.data;
    } else {
      problems.push(
        ...result.error.issues.map((issue) => ({
          location: part,
          field: issue.path.join('.') || part,
          message: issue.message,
        })),
      );
    }
  }

  if (problems.length) return next(Errors.validation(problems));
  req.valid = valid;
  return next();
};

/** Rejects bodies that are not JSON on write methods (only JSON is accepted and produced). */
function requireJson(req, _res, next) {
  const hasBody = Number(req.get('content-length') || 0) > 0 || req.get('transfer-encoding');
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && hasBody && !req.is('application/json')) {
    return next(Errors.unsupportedMediaType());
  }
  return next();
}

module.exports = { validate, requireJson };
