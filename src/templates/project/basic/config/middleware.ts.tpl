/**
 * Middleware Configuration
 * Define global and named (route) middleware for your application.
 */

import type { Middleware } from '@zintrust/core';
import {
  authMiddleware,
  corsMiddleware,
  jsonMiddleware,
  loggingMiddleware,
} from '@app/Middleware';

export type MiddlewareConfig = {
  global: Middleware[];
  route: Record<string, Middleware>;
};

const middlewareConfigObj: MiddlewareConfig = {
  // Global middleware runs on every request.
  global: [corsMiddleware, jsonMiddleware, loggingMiddleware],

  // Route middleware can be referenced by name (e.g. { middleware: ['auth'] }).
  route: {
    auth: authMiddleware,
  },
};

export const middlewareConfig = Object.freeze(middlewareConfigObj);
export default middlewareConfig;
