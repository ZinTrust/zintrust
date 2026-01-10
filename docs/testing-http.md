# Testing HTTP

Zintrust includes small testing helpers that let you test:

- route registration + middleware + kernel handling (request-level “integration-ish” tests)
- individual handlers/middleware in isolation (unit-style tests)

Primary helpers:

- `tests/helpers/TestEnvironment.ts`
- `tests/helpers/TestHttp.ts`

## Two levels of HTTP testing

### 1) Through the Kernel (recommended for most HTTP behavior)

Use `TestEnvironment` when you want to exercise:

- routing (method/path matching)
- middleware stack execution
- handler behavior
- response serialization (status/headers/body)

`TestEnvironment` creates:

- a real `Router`
- a `ServiceContainer` (with support for swaps)
- a `Kernel`

Then it runs a request through `kernel.handleRequest(req, res)` using a lightweight Node request/response stub.

Example:

```ts
import { describe, expect, it } from 'vitest';
import { TestEnvironment } from '@/tests/helpers/TestEnvironment';
import { Router } from '@/routing/Router';

it('returns 200 from /health', async () => {
  const env = TestEnvironment.create({
    registerRoutes(router) {
      Router.get(router, '/health', async (_req, res) => {
        res.json({ ok: true });
      });
    },
  });

  const res = await env.request({ method: 'GET', path: '/health' });
  expect(res.status).toBe(200);
  expect(res.json).toEqual({ ok: true });
});
```

What you get back (`TestResponse`):

- `status`
- `headers`
- `bodyText` (raw)
- `json` (best-effort JSON parse; falls back to raw text)
- `cookies` parsed from `Set-Cookie`

### 2) Direct handler/middleware calls (fast unit-style)

Use `TestHttp` when you want to test a handler without routing/kernel concerns.

`TestHttp` provides:

- `createRequest()` to build an `IRequest` (with method/path/headers/body/params/context)
- `createValidatedRequest()` for strongly typed `req.validated`
- `createResponseRecorder()` to capture status/headers/body writes

Example:

```ts
import { expect, it } from 'vitest';
import { TestHttp } from '@/tests/helpers/TestHttp';

it('handler writes JSON', async () => {
  const req = TestHttp.createRequest({ method: 'GET', path: '/x' });
  const res = TestHttp.createResponseRecorder();

  await myHandler(req, res);

  expect(res.getStatus()).toBe(200);
  expect(res.getJson()).toEqual({ ok: true });
});
```

## Headers and casing

Both helpers lowercase request header keys before passing them into the request wrapper.
This matches how `IRequest.getHeader()` normalizes header names.

## Query strings

When using `TestEnvironment.request({ path })` or `TestHttp.createRequest({ path })`, you can include a query string in `path` (e.g. `/users?limit=10`). The request wrapper parses query parameters from the URL.

## Recommended conventions

- Use `TestEnvironment` for most request/response and middleware behavior.
- Use `TestHttp` for pure handler/middleware unit tests.
- If your handler expects `req.validated.*`, either:
  - run the validation middleware in a `TestEnvironment` route, or
  - use `TestHttp.createValidatedRequest(...)` for a tight unit test.
