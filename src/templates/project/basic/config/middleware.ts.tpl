/**
 * Middleware Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns middleware construction / any runtime behavior.
 * - Projects can override by editing `middlewareConfigObj`.
 */

import { middlewareConfig as coreMiddlewareConfig } from '@zintrust/core';
import { CsrfMiddleware } from '@zintrust/core';

type MiddlewareConfigShape = typeof coreMiddlewareConfig;

// Optional: if you're building a pure Bearer-token API (no cookie auth),
// you can bypass CSRF for API routes.
// Example: ['\/api\/*'] skips CSRF for all API endpoints.
const csrf = CsrfMiddleware.create({
  skipPaths: [],
});

export const middlewareConfigObj = {
  ...coreMiddlewareConfig,
  route: {
    ...coreMiddlewareConfig.route,
    csrf,
  },
  // Keep global middleware order but swap in the overridden CSRF middleware.
  global: coreMiddlewareConfig.global.map((mw) => (mw === coreMiddlewareConfig.route.csrf ? csrf : mw)),
} satisfies MiddlewareConfigShape;

export const middlewareConfig = middlewareConfigObj;
export default middlewareConfig;
