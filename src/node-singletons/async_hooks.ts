/**
 * Node.js Async Hooks Module Singleton
 * Safe to import in both API and CLI code
 * Exported from node:async_hooks built-in
 */

import * as async_hooks from 'node:async_hooks';

export const { AsyncLocalStorage, AsyncResource, createHook, executionAsyncId, triggerAsyncId } =
  async_hooks;

export default async_hooks;
