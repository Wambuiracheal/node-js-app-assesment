'use strict';

const { z } = require('zod');
const { phoneNumber } = require('../../lib/validators');

// Validates that a string is a valid email address and normalizes it to lowercase.
const email = z
  .string({ required_error: 'email is required' })
  .trim()
  .toLowerCase()
  .email('email must be a valid e-mail address')
  .max(254);

  // Validates that a string is a valid password according to the following rules:
const password = z
  .string({ required_error: 'password is required' })
  .min(8, 'password must be at least 8 characters')
  .max(72, 'password must be at most 72 characters') // bcrypt only uses the first 72 bytes
  .regex(/[A-Za-z]/, 'password must contain a letter')
  .regex(/\d/, 'password must contain a digit');

  // Validates the request body for user registration and login endpoints.
const register = z
  .object({
    fullName: z
      .string({ required_error: 'fullName is required' })
      .trim()
      .min(3, 'fullName must be at least 3 characters')
      .max(120)
      .regex(/^[\p{L}' .-]+$/u, 'fullName may only contain letters, spaces, apostrophes, dots and hyphens'),
    email,
    phoneNumber,
    password,
  })
  .strict();

const login = z
  .object({
    email,
    password: z.string({ required_error: 'password is required' }).min(1, 'password is required'),
  })
  .strict();

module.exports = { register, login };
