'use strict';

const toUserDto = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  phoneNumer: user.phone_number,
  role: user.role,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

module.exports = { toUserDto };
