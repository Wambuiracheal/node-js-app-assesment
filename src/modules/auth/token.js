'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../config');

const ALGORITHM = 'HS256';

const signAccessToken = (user) =>
  jwt.sign({ role: user.role }, config.auth.jwtSecret, {
    subject: user.id,
    algorithm: ALGORITHM,
    expiresIn: config.auth.jwtExpiresIn,
    issuer: config.auth.jwtIssuer,
    audience: config.auth.jwtAudience,
  });


const verifyAccessToken = (token) =>
  jwt.verify(token, config.auth.jwtSecret, {
    algorithms: [ALGORITHM],
    issuer: config.auth.jwtIssuer,
    audience: config.auth.jwtAudience,
  });

const decodeExpiry = (token) => jwt.decode(token).exp;

module.exports = { signAccessToken, verifyAccessToken, decodeExpiry };
