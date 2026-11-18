'use strict';


const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

const runWithContext = (context, fn) => storage.run({ ...context }, fn);

const getContext = () => storage.getStore() || {};

const setContextValue = (key, value) => {
  const store = storage.getStore();
  if (store) store[key] = value;
};

module.exports = { runWithContext, getContext, setContextValue };
