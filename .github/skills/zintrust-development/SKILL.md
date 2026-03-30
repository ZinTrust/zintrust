---
name: zintrust-development
description: ZinTrust repository development conventions, runtime rules, and architecture guidance.
---

# ZinTrust Development Skill

This skill provides AI agents with comprehensive knowledge of ZinTrust's conventions, patterns, and architecture so they can write correct, idiomatic code for the framework.

---

## 1. The Golden Rules (Always Check First)

1. **Dual-runtime mandate**: Every change must work with `zin s` (Node.js) AND `zin s --wg` (Cloudflare Workers). If anything is runtime-specific, flag it before implementing.
2. **Brand spelling**: Always "ZinTrust" — never "zintrust", "Zintrust", or "ZINTrust" in prose, docs, and comments. Code identifiers (type names, module paths, etc.) must match the actual exported names even when those names use "Zintrust" (e.g. `IZintrustError`, `@exceptions/ZintrustError`).
3. **No classes**: Use factory functions and sealed namespaces (`Object.freeze`) in `src/`, `app/`, `routes/`, `bin/`.
4. **No `new Error(...)`**: Use `ErrorFactory.*` from `@exceptions/ZintrustError` in all app/framework code. CLI commands (`src/cli/`) and low-level core internals may use `new Error` where lint overrides are present.
5. **No `console.*`**: Use `Logger.*` from `@config/logger` in app/framework code. CLI commands and scripts may use `console.*` where appropriate.
6. **No raw Node built-ins**: Import through `@node-singletons/*` wrappers (e.g. `import { join } from '@node-singletons/path'`) in runtime-agnostic app/framework code. CLI commands (`src/cli/`) and scripts may import `node:*` directly.
7. **Use shared helpers**: Use utilities from `@helper/index` instead of re-implementing them.
8. **Consistency over cleverness**: When in doubt, copy structure from an existing similar module.

---

## 2. Project Layout

```
app/                    # Application code (Controllers, Jobs, Middleware, Models, Workers)
  Controllers/          # Request handlers (factory pattern, never classes)
  Jobs/                 # Background job services
  Middleware/           # App-level middleware
  Models/               # ORM model definitions
  Workers/              # Background worker definitions
bin/                    # CLI entrypoints (zin.ts, z.ts)
config/                 # Runtime config (database.ts, cache.ts, queue.ts, mail.ts, workers.ts)
database/               # Migrations, seeders, factories
@zintrust/*             # Optional adapters (db, cache, queue, mail, storage)
routes/                 # Route definitions (api.ts)
src/                    # Framework core (DO NOT modify unless contributing to core)
  auth/                 # Auth subsystem
  cache/                # Cache driver abstraction
  cli/                  # CLI infrastructure + all commands
  config/               # env.ts, logger.ts, security.ts, cloudflare.ts
  exceptions/           # ZintrustError, ErrorFactory
  helper/               # Shared type/validation helpers
  http/                 # Request and Response abstractions
  middleware/           # Framework middleware
  microservices/        # Microservice framework
  migrations/           # Migration engine
  node-singletons/      # Node built-in wrappers (for cross-runtime compat)
  orm/                  # ORM: Model, QueryBuilder, relations
  routes/               # Router implementation
  security/             # JWT, CSRF, Encryption, Hash, Sanitizer, XSS, etc.
  services/             # Framework services
  session/              # Session management
  start.ts              # Bootstrap entry
  validation/           # Schema + Validator
tests/                  # All tests (unit/, integration/, patch-coverage/)
  vitest.setup.ts       # Global Vitest setup and mocks
```

---

## 3. Path Aliases (`tsconfig.json`)

Always use alias imports in framework and app code. Never use relative paths like `../../src`.

```ts
'@zintrust/core'          → src/index.ts               // public framework API
'@/*'                     → src/*
'@app/*'                  → app/*
'@routes/*'               → routes/*
'@core-routes/*'          → src/routes/*
'@orm/*'                  → src/orm/*
'@http/*'                 → src/http/*
'@config/*'               → src/config/*
'@runtime-config/*'       → config/*
'@security/*'             → src/security/*
'@validation/*'           → src/validation/*
'@exceptions/*'           → src/exceptions/*
'@middleware/*'           → src/middleware/*
'@auth/*'                 → src/auth/*
'@helper/*'               → src/helper/*
'@common/*'               → src/common/*
'@events/*'               → src/events/*
'@session/*'              → src/session/*
'@cache/*'                → src/cache/*
'@queue/*'                → src/tools/queue/*
'@mail/*'                 → src/tools/mail/*
'@storage'                → src/tools/storage/index.ts
'@storage/*'              → src/tools/storage/*
'@notification/*'         → src/tools/notification/*
'@broadcast/*'            → src/tools/broadcast/*
'@templates'              → src/tools/templates/index.ts
'@templates/*'            → src/tools/templates/*
'@services/*'             → src/services/*
'@scheduler/*'            → src/scheduler/*
'@node-singletons/*'      → src/node-singletons/*
'@node-singletons'        → src/node-singletons/index.ts
'@runtime/*'              → src/runtime/*
'@cli/*'                  → src/cli/*
'@boot/*'                 → src/boot/*
'@microservices/*'        → src/microservices/*
'@toolkit/*'              → src/toolkit/*
'@tools/*'                → src/tools/*
'@workers/*'              → src/workers/*
'@zintrust/workers'       → @zintrust/workers
'@zintrust/db-mysql'      → @zintrust/db-mysql
'@zintrust/db-postgres'   → @zintrust/db-postgres
'@zintrust/db-sqlite'     → @zintrust/db-sqlite
'@zintrust/db-d1'         → @zintrust/db-d1
'@zintrust/queue-redis'   → @zintrust/queue-redis
```

---

## 4. Routing (`routes/api.ts`)

```ts
import { type IRouter, Router } from '@core-routes/Router';
import type { MiddlewareKey } from '@config/middleware';

export function registerRoutes(router: IRouter): void {
  // Simple routes
  Router.get(router, '/health', healthHandler);
  Router.post(router, '/login', loginHandler);

  // Routes with middleware
  Router.get<MiddlewareKey>(router, '/profile', profileHandler, {
    middleware: ['auth', 'jwt'],
  });

  // Group (prefix scoping)
  Router.group(router, '/api/v1', (r: IRouter) => {
    Router.get(r, '/users', usersHandler);
    Router.post(r, '/users', createUserHandler);
  });

  // Group with default middleware for all children
  Router.group<MiddlewareKey>(
    router,
    '/admin',
    (r: IRouter) => {
      Router.get(r, '/dashboard', dashboardHandler);
    },
    { middleware: ['auth'] }
  );

  // Resource routes (creates full REST CRUD)
  const ctrl = UserController.create();
  Router.resource<MiddlewareKey>(
    router,
    '/users',
    {
      index: ctrl.index, // GET    /users
      store: ctrl.store, // POST   /users
      show: ctrl.show, // GET    /users/:id
      update: ctrl.update, // PUT+PATCH /users/:id
      destroy: ctrl.destroy, // DELETE /users/:id
    },
    {
      middleware: ['auth'], // default for all actions
      store: { middleware: ['auth', 'validateUserStore'] }, // per-action override
      update: { middleware: ['auth', 'validateUserUpdate'] },
    }
  );
}
```

**Route param syntax:**

- `:id` → single path segment
- `:path*` → greedy (captures slashes too)

---

## 5. Controllers / Request Handlers

Use the factory + sealed namespace pattern. **Never use classes.**

```ts
// app/Controllers/UserController.ts
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { Logger } from '@config/logger';
import { requireValidatedBody } from '@http/ValidationHelper';
import { User } from '@app/Models/User';

async function index(req: IRequest, res: IResponse): Promise<void> {
  const users = await User.query().all();
  res.json({ data: users });
}

async function show(req: IRequest, res: IResponse): Promise<void> {
  const id = req.getParam('id');
  const user = await User.query().find(Number(id));
  if (!user) {
    throw ErrorFactory.createNotFoundError('User not found', { id });
  }
  res.json({ data: user });
}

async function store(req: IRequest, res: IResponse): Promise<void> {
  // Use requireValidatedBody when validation middleware is guaranteed (throws if missing)
  const body = requireValidatedBody<{ name: string; email: string }>(req);
  const user = await User.create(body);
  Logger.info('User created', { id: user.getAttribute('id') });
  res.setStatus(201).json({ data: user });
}

export const UserController = Object.freeze({
  create: () => Object.freeze({ index, show, store }),
});
```

**Useful request/response methods:**

```ts
req.getParam('id'); // URL route params
req.getQuery('page'); // Query string values
getValidatedBody<T>(req); // Body parsed + validated — returns T | undefined (check or use requireValidatedBody)
requireValidatedBody<T>(req); // Like getValidatedBody but throws if validation middleware wasn't applied
hasValidatedBody(req); // Type guard: true if validation middleware populated the body
req.getRaw(); // Raw Node IncomingMessage

res.json({ key: 'value' }); // JSON response
res.setStatus(201).json({}); // With status code
res.setHeader('X-Header', 'v'); // Set response header
res.locals.myData = value; // Pass data to downstream middleware
```

---

## 6. ORM Models

```ts
// app/Models/User.ts
import { Model } from '@orm/Model';

export const User = Model.define({
  table: 'users',
  fillable: ['name', 'email', 'password'],
  hidden: ['password'],
  timestamps: true, // adds created_at / updated_at
  softDeletes: true, // adds deleted_at (restore(), forceDelete())
  casts: {
    id: 'number',
    active: 'boolean',
    created_at: 'date',
  },
  accessors: {
    full_name: (value, attrs) => `${attrs.first_name} ${attrs.last_name}`,
  },
  mutators: {
    password: (value) => hashSync(value),
  },
  scopes: {
    active: (builder) => builder.where('active', true),
  },
});
```

**Model instance methods:**

```ts
model.fill(attributes)
model.setAttribute('key', value)
model.getAttribute('key')
model.getAttributes()           // all attributes as plain object
model.save()                    // INSERT or UPDATE
model.delete()                  // soft delete (if enabled) or hard delete
model.restore()                 // un-soft-delete
model.forceDelete()             // hard delete even when softDeletes is on
model.isDeleted()
model.isDirty('key'?)           // check if pending changes
model.toJSON()
model.setRelation('posts', posts)
model.getRelation<Post[]>('posts')
```

**Relationship helpers (call on model instance):**

```ts
model.hasOne(RelatedModel, foreignKey?)
model.hasMany(RelatedModel, foreignKey?)
model.belongsTo(RelatedModel, foreignKey?)
model.belongsToMany(RelatedModel, throughTable?, foreignKey?, relatedKey?)
model.morphOne(RelatedModel, morphName)
model.morphMany(RelatedModel, morphName)
model.morphTo(morphName, morphMap)
model.hasOneThrough(RelatedModel, ThroughModel, firstKey?, secondKey?)
model.hasManyThrough(RelatedModel, ThroughModel, firstKey?, secondKey?)
```

---

## 7. Validation

```ts
import { Schema, Validator } from '@validation/Validator';

const schema = Schema.create()
  .required('email')
  .email('email')
  .required('name')
  .string('name')
  .minLength('name', 2)
  .maxLength('name', 255)
  .required('age')
  .integer('age')
  .min('age', 18)
  .max('age', 100)
  .required('role')
  .in('role', ['admin', 'user', 'guest'])
  .boolean('active')
  .uuid('userId')
  .url('website')
  .phone('mobile')
  .date('dob')
  .regex('code', /^\d{4}$/)
  .custom('field', (value) => typeof value === 'string');
```

Register schema as middleware on a route to auto-validate and populate `getValidatedBody()`. Validation middlewares are concrete named keys registered in `src/config/middleware.ts` (e.g. `validateLogin`, `validateUserStore`). Add new ones there following the same pattern:

```ts
// Using an existing validation middleware key:
Router.post<MiddlewareKey>(router, '/users', handler, {
  middleware: ['auth', 'validateUserStore'],
});
```

---

## 8. Error Handling

**Import:** `import { ErrorFactory } from '@exceptions/ZintrustError';`

| Method                                                     | HTTP Status | Use case                      |
| ---------------------------------------------------------- | ----------- | ----------------------------- |
| `ErrorFactory.createNotFoundError(msg?, details?)`         | 404         | Resource not found            |
| `ErrorFactory.createUnauthorizedError(msg?, details?)`     | 401         | Not authenticated             |
| `ErrorFactory.createForbiddenError(msg?, details?)`        | 403         | Authenticated but not allowed |
| `ErrorFactory.createValidationError(msg, details?)`        | 400         | Input validation failed       |
| `ErrorFactory.createDatabaseError(msg, details?)`          | 500         | Database query failure        |
| `ErrorFactory.createConfigError(msg, details?)`            | 500         | Missing/invalid config        |
| `ErrorFactory.createConnectionError(msg, details?)`        | 500         | Network/connection failure    |
| `ErrorFactory.createSecurityError(msg, details?)`          | 401         | Security check failure        |
| `ErrorFactory.createGeneralError(msg, details?)`           | 500         | Catch-all server error        |
| `ErrorFactory.createWorkerError(msg, details?)`            | 500         | Worker failure                |
| `ErrorFactory.createSanitizerError(method, reason, value)` | 400         | Sanitizer failure             |

**Usage:**

```ts
// Throw — the framework catches and sends structured JSON error response
throw ErrorFactory.createNotFoundError('User not found', { id });
throw ErrorFactory.createValidationError('Invalid input', { field: 'email' });
throw ErrorFactory.createForbiddenError();
```

---

## 9. Logging

**Import:** `import { Logger } from '@config/logger';`

```ts
Logger.debug('message', { extra: 'data' });
Logger.info('User logged in', { userId: 1 });
Logger.warn('Rate limit approaching', { requests: 950 });
Logger.error('Database query failed', error);
Logger.fatal('Unrecoverable error', error);

// Scoped logger (adds category prefix to all output)
const log = Logger.scope('AuthController');
log.info('Login attempt', { email });
```

**Auto-redacted fields** (never logged in plain text):
`password`, `token`, `authorization`, `secret`, `apikey`, `api_key`, `jwt`, `bearer`

**Env vars:**

- `LOG_LEVEL` → `debug | info | warn | error` (default: `info`)
- `LOG_FORMAT` → `text | json` (default: `text`)
- `DISABLE_LOGGING` → `true` to suppress all output

---

## 10. Environment / Config

**Import:** `import { Env } from '@config/env';`

```ts
// Read values
Env.get('KEY', 'defaultString')
Env.getInt('PORT', 3000)
Env.getFloat('RATE', 1.5)
Env.getBool('FEATURE_FLAG', false)

// Common pre-resolved properties
Env.NODE_ENV    Env.PORT        Env.HOST
Env.APP_NAME    Env.APP_KEY     Env.BASE_URL
Env.DB_CONNECTION  Env.DB_HOST  Env.DB_DATABASE
Env.LOG_LEVEL
```

---

## 11. Helper Utilities

**Import:** `import { isNonEmptyString, isInt, isUUID, ... } from '@helper/index';`

### Type checks

```ts
isString(v)          isArray(v)         isObject(v)
isFunction(v)        isDate(v)          isNonEmptyArray(v)
isNonEmptyObject(v)
```

### Null / empty checks

```ts
isNonEmptyString(v); // v is string && v.trim() !== ''
isUndefined(v);
isNull(v); // ⚠️ also true for '' and 'null'
isUndefinedOrNull(v); // ⚠️ also true for '' and 'null'
isEmpty(v); // ⚠️ legacy: also true for 0 and '0'
```

### Numeric

```ts
isInt(v)                           // strict: must be number type
isInt(v, true)                     // accepts number or numeric string
isInt(v, true, { min: 1, max: 100 })
isFloat(v)
isFloat(v, true)
isFloat(v, true, { min: 0.0, max: 1.0 })
isNumeric(v)
isIntString(v, { min?, max? })
isFloatString(v, { min?, max? })
```

### Boolean

```ts
isBoolean(v); // strict: only true/false
isBoolean(v, true); // also accepts 'true'/'false'/'1'/'0' strings
isBooleanString(v);
```

### String format

```ts
isNonEmptyString(v)
isEmail(v)           isUrl(v)         isUUID(v)
isAlpha(v)           isAlphanumeric(v) isSlug(v)
isHexColor(v)        isJSON(v)        isBase64(v)
isMatch(v, regex)    // ReDoS-safe; caps at 2048 chars
isWhitespaceOnly(v)
```

### Collections

```ts
isIn(v, array)       isNotIn(v, array)
isLength(v, n)       isMinLength(v, n)   isMaxLength(v, n)
```

### ⚠️ Common semantics traps

```ts
isEmpty(0); // true  ← probably not what you want
isEmpty('0'); // true  ← probably not what you want
isNull(''); // true  ← treats empty string as null-like
isNull('null'); // true  ← treats the string "null" as null-like
```

---

## 12. Middleware

```ts
// app/Middleware/MyMiddleware.ts
import type { Middleware } from '@middleware/MiddlewareStack';
import { Logger } from '@config/logger';

export const MyMiddleware: Middleware = async (req, res, next) => {
  // Pre-handler logic
  Logger.debug('Request received', { path: req.getPath?.() });

  await next(); // passes control to next middleware or handler

  // Post-handler logic (runs after handler responds)
  Logger.debug('Request handled');
};
```

Register your middleware key in `config/middleware.ts` so it can be referenced by name in route metadata.

---

## 13. Node Singletons (Cross-Runtime Wrappers)

Never import `node:*` directly. Always use the singleton wrappers so code runs in both Node and Cloudflare Workers.

```ts
// ✅ Correct
import { join, dirname } from '@node-singletons/path';
import { randomBytes, createHash } from '@node-singletons/crypto';
import { readFile, writeFile } from '@node-singletons/fs';

// ❌ Wrong
import path from 'node:path';
import { readFile } from 'node:fs/promises';
```

**Available singletons:**
`async_hooks`, `child-process`, `crypto`, `events`, `fs`, `http`, `module`, `net`, `os`, `path`, `perf-hooks`, `process`, `readline`, `stream`, `tls`, `url`, `util`

---

## 14. Sealed Namespace Pattern

This is the standard for all ZinTrust modules. No classes — use private functions exposed via `Object.freeze`.

```ts
// src/services/MyService.ts

// 1. Private implementation functions
const fetchUser = async (id: number) => {
  // ...
};

const createUser = async (data: UserInput) => {
  // ...
};

// 2. Export as frozen sealed namespace
export const MyService = Object.freeze({
  fetchUser,
  createUser,
});

export default MyService;
```

**Reference implementations to copy from:**

- `src/routes/Router.ts` — routing namespace
- `src/config/logger.ts` — logger namespace
- `src/orm/Model.ts` — ORM namespace
- `app/Jobs/EmailJobService.ts` — job service

---

## 15. Jobs / Background Workers

```ts
// app/Jobs/MyJobService.ts
import { MyQueue } from '@app/Workers/MyWorker';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

export const MyJobService = Object.freeze({
  async dispatchEmail(to: string, subject: string, queueName = 'default'): Promise<string> {
    const payload = { to, subject, template: 'welcome' };
    const jobId = await MyQueue.add(payload, queueName);
    Logger.info('Job dispatched', { jobId, to });
    return jobId;
  },
});
```

---

## 16. Security Features

All security utilities live in `src/security/` and are exported via `@zintrust/core` or `@security/*`.

| Feature                  | Import                                                          |
| ------------------------ | --------------------------------------------------------------- |
| JWT sign/verify          | `import { JwtManager } from '@security/JwtManager'`             |
| JWT sessions (allowlist) | `import { JwtSessions } from '@security/JwtSessions'`           |
| JWT token revocation     | `import { TokenRevocation } from '@security/TokenRevocation'`   |
| CSRF protection          | `import { CsrfTokenManager } from '@security/CsrfTokenManager'` |
| Password hashing         | `import { Hash } from '@security/Hash'`                         |
| AES encryption           | `import { Encryptor } from '@security/Encryptor'`               |
| Input sanitizer          | `import { Sanitizer } from '@security/Sanitizer'`               |
| XSS protection           | `import { XssProtection } from '@security/XssProtection'`       |
| HMAC signed requests     | `import { SignedRequest } from '@security/SignedRequest'`       |
| Nonce replay prevention  | `import { NonceReplay } from '@security/NonceReplay'`           |

**JWT Revocation Drivers** (via `JWT_REVOCATION_DRIVER` env var):
`database` (default) | `redis` | `kv` | `kv-remote` | `memory`

---

## 17. Available Adapter Packages

| Package               | Import                      |
| --------------------- | --------------------------- |
| MySQL                 | `@zintrust/db-mysql`        |
| PostgreSQL            | `@zintrust/db-postgres`     |
| SQLite                | `@zintrust/db-sqlite`       |
| Cloudflare D1         | `@zintrust/db-d1`           |
| SQL Server            | `@zintrust/db-sqlserver`    |
| Redis Cache           | `@zintrust/cache-redis`     |
| Redis Queue           | `@zintrust/queue-redis`     |
| RabbitMQ Queue        | `@zintrust/queue-rabbitmq`  |
| AWS SQS Queue         | `@zintrust/queue-sqs`       |
| Nodemailer Mail       | `@zintrust/mail-nodemailer` |
| Mailgun Mail          | `@zintrust/mail-mailgun`    |
| SendGrid Mail         | `@zintrust/mail-sendgrid`   |
| AWS S3 Storage        | `@zintrust/storage-s3`      |
| Cloudflare R2 Storage | `@zintrust/storage-r2`      |
| Google Cloud Storage  | `@zintrust/storage-gcs`     |
| Background Workers    | `@zintrust/workers`         |

---

## 18. Testing Conventions

```ts
// tests/unit/MyModule.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// ✅ For core/internal module tests: import from src/index (covers the local build output)
import { MyModule } from '../../../src/index';
// ✅ For consumer/package tests that test integration with the published package: import from @zintrust/core
// import { MyModule } from '@zintrust/core';

// Mock logger — always do this to suppress output in tests
vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

describe('MyModule', () => {
  beforeAll(async () => {
    // setup
  });

  afterAll(async () => {
    // teardown: always restore env vars, mocks, etc.
  });

  it('does the thing correctly', async () => {
    await expect(MyModule.doThing('input')).resolves.toBe('expected');
  });

  it('throws on invalid input', async () => {
    await expect(MyModule.doThing('')).rejects.toThrow(/KV binding/);
  });
});
```

**Test structure conventions:**

- Core/internal module tests import from `src/index` (local build); consumer/package tests that test integration with the published package use `@zintrust/core` (see `tests/vitest.setup.ts` for its mock)
- Always mock `@config/logger` to suppress noise
- Always restore `process.env` vars changed in tests
- Use `vi.resetModules()` before re-importing a module with different env config
- For env-dependent module tests: set env → `vi.resetModules()` → re-import → test → restore env

---

## 19. QA Workflow

Always run QA before finishing any task:

```bash
# Fast loop (run in this order):
npm test                    # Vitest – run all tests
npm run type-check          # tsc --noEmit
npm run lint                # ESLint

# Focused coverage on changed code:
npm run -s coverage:patch

# Full QA suite:
zin qa                      # lint + type-check + tests + Sonar → HTML report
```

**Target order for quick validation:**

1. `npm test` → fix any broken tests
2. `npm run type-check` → fix any type errors
3. `npm run lint` → fix any lint warnings
4. `npm run -s coverage:patch` → ensure new code is covered

---

## 20. CLI Reference

```bash
zin s                       # Start Node.js server (dev)
zin s --wg                  # Start Cloudflare Workers server (dev)
zin routes                  # List all registered routes
zin migrate                 # Run database migrations
zin migrate:rollback        # Rollback last migration
zin db:seed                 # Run database seeders
zin key:generate            # Generate a new APP_KEY
zin make:controller Name    # Scaffold a controller
zin make:model Name         # Scaffold a model
zin make:migration Name     # Scaffold a migration
zin make:middleware Name    # Scaffold middleware
zin make:job Name           # Scaffold a job
zin schedule:run            # Run the scheduler once
zin schedule:start          # Start the scheduler daemon
zin queue                   # Queue management
zin debug                   # Debug tools
zin qa                      # Full QA suite
zin deploy                  # Deploy
```

---

## 21. Common Patterns Checklist

When implementing any new feature, confirm:

- [ ] Runs in Node.js (`zin s`) ✓
- [ ] Runs in Cloudflare Workers (`zin s --wg`) ✓
- [ ] Uses `ErrorFactory.*` not `new Error()` ✓
- [ ] Uses `Logger.*` not `console.*` ✓
- [ ] Uses `@node-singletons/*` not `node:*` directly ✓
- [ ] Uses `@helper/index` utilities not one-off reimplementations ✓
- [ ] Factory function + `Object.freeze` not a class ✓
- [ ] Uses path aliases not relative paths ✓
- [ ] Has unit tests (`npm test` passes) ✓
- [ ] Passes `npm run type-check` ✓
- [ ] Passes `npm run lint` ✓
- [ ] New docs added to `docs/` are linked in `docs-website/config.ts` ✓
