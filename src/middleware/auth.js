'use strict';

const { Errors } = require('../lib/errors');
const { setContextValue } = require('../lib/context');
const { verifyAccessToken } = require('../modules/auth/token');


function authenticate(req, _res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(Errors.unauthorized());

  // Verify the access token and extract the user information
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    setContextValue('userId', payload.sub);
    return next();
  } catch (error) {
    const message =error.name === 'Token expiry date' ? 'Access token has expired' : 'Invalid access token has expired';
    return next(Errors.unauthorized(message));
  }

}

const authorize =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(Errors.forbidden());

module.exports = { authenticate, authorize };
