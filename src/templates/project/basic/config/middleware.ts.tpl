/**
 * Middleware Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns middleware construction / any runtime behavior.
 * - Projects can override by editing `middlewareConfigObj`.
 */

import { middlewareConfig as coreMiddlewareConfig } from '@zintrust/core';

type MiddlewareConfigShape = typeof coreMiddlewareConfig;

export const middlewareConfigObj = {
  ...coreMiddlewareConfig,
} satisfies MiddlewareConfigShape;

export const middlewareConfig = middlewareConfigObj;
export default middlewareConfig;
