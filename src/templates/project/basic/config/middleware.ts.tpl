// @ts-ignore - config templates are excluded from the main TS project in this repo
/**
 * Middleware Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns middleware construction / any runtime behavior.
 * - Projects can override by editing `middlewareConfigObj`.
 */

import { Env } from '@zintrust/core';
import type { MiddlewaresType } from '@zintrust/core';

export default {
  skipPaths: Env.get('CSRF_SKIP_PATHS', '')
    .split(',')
    .map((m: string) => m.trim())
    .filter((m: string) => m.length > 0) as ReadonlyArray<string>,
  fillRateLimit: {
    windowMs: 60_000,
    max: 5,
    message: 'Too many fill requests, please try again later.',
  },
  authRateLimit: {
    windowMs: 60_000,
    max: 4,
    message: 'Too many authentication attempts, please try again later.',
  },
  userMutationRateLimit: {
    windowMs: 60_000,
    max: 20,
    message: 'Too many user mutation requests, please try again later.',
  },
} as MiddlewaresType;
