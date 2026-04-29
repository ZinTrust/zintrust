// @ts-ignore - config templates are excluded from the main TS project in this repo
import { Env } from '@zintrust/core';
import type { MiddlewaresType } from '@zintrust/core';
/**
 * Middleware Configuration (template)
 *
 * Full project middleware flow:
 * 1. Create `app/Middleware/YourMiddleware.ts` and export a `Middleware` function.
 * 2. Import it below.
 * 3. Register route middleware under `route` or append global middleware under `global`.
 * 4. Use the route key in `routes/*.ts`.
 * 5. Use `responders` when you only want to reshape built-in failure payloads.
 *
 * Built-in middleware keys are overrideable by reusing the same key under `route`.
 * For example, `route.jwt = MyJwtMiddleware` replaces the framework `jwt` middleware
 * anywhere that key is used, including shared global slots such as `log`, `error`,
 * `security`, `rateLimit`, `csrf`, and `sanitizeBody`.
 *
 * For custom route keys, extend the framework type locally in your route file:
 * `type AppMiddlewareKey = MiddlewareKey | 'yourMiddleware';`
 */

// Example custom middleware import:
// import { AuthMiddleware } from '@app/Middleware/AuthMiddleware';
// import { authFailureResponder } from '@app/Middleware/AuthFailureResponder';
// import { JwtAuthOverrideMiddleware } from '@app/Middleware/JwtAuthOverrideMiddleware';

export default {
  skipPaths: Env.get('CSRF_SKIP_PATHS', '')
    .split(',')
    .map((m: string) => m.trim())
    .filter((m: string) => m.length > 0) as ReadonlyArray<string>,
  fillRateLimit: {
    windowMs: 60_000,
    maxRequests: 5,
    message: 'Too many fill requests, please try again later.',
  },
  authRateLimit: {
    windowMs: 60_000,
    maxRequests: 4,
    message: 'Too many authentication attempts, please try again later.',
  },
  userMutationRateLimit: {
    windowMs: 60_000,
    maxRequests: 20,
    message: 'Too many user mutation requests, please try again later.',
  },
  responders: {
    // auth: authFailureResponder,
    // jwt: authFailureResponder,
    // bulletproof: authFailureResponder,
    // csrf: authFailureResponder,
    // rateLimit: authFailureResponder,
    // error: authFailureResponder,
  },
  global: [
    // AuthMiddleware,
  ],
  route: {
    // authMiddleware: AuthMiddleware,
    // Plug-and-play built-in override example:
    // jwt: JwtAuthOverrideMiddleware,
  },
} as MiddlewaresType;
