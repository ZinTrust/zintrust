# ZinTrust Agent Guide (`AGENTS.md`)

This file tells AI coding agents how to build correctly with ZinTrust.

**How to use it:** copy this file to the root of your ZinTrust app as `AGENTS.md`, or paste it into your AI tool's custom instructions. Agents that read `AGENTS.md` automatically will follow the rules below. Published at `https://zintrust.com/agents.md`.

---

## 0. Non-Negotiable Rules

Follow these rules in every change. They are not optional.

1. **Dual runtime.** Code must run on Node (`zin s`) and Cloudflare Workers (`zin s --wg`). Do not add runtime-specific branches unless the user asks for them. If something cannot run on both runtimes, stop and flag it.
2. **Import from `@zintrust/core`.** That is the public package. Do not import from internal `src/` paths in app code.
3. **No classes in app code.** Use factory functions and sealed namespaces (`Object.freeze({...})`).
4. **No `new Error(...)`.** Use `ErrorFactory.*` (see [Errors](#11-errors)).
5. **No `console.*`.** Use `Logger.*` (see [Logging](#12-logging-and-config)).
6. **No `node:*` imports** in runtime-agnostic code. Use `@node-singletons/*` wrappers.
7. **Use shared helpers** from `@zintrust/core` (`isNonEmptyString`, `isInt`, and so on) instead of writing one-off checks.
8. **Validate and sanitize all external input** before it reaches the database or another service.
9. **Only comment code that needs clarification.**
10. **Brand spelling is "ZinTrust".**

Optional `@zintrust/*` adapter packages that must load at startup on both runtimes use this two-step lazy-load pattern only. First probe with a static specifier inside `tryImport`, then retry with a concatenated specifier:

```ts
const tryImport = async <T>(load: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await load();
  } catch {
    return undefined;
  }
};

const loadQueueRedis = async (): Promise<unknown> => {
  const first = await tryImport(() => import('@zintrust/queue-redis'));
  if (first !== undefined) return first;
  return import('@zintrust/' + 'queue-redis').catch(() => undefined);
};
```

Do not add other lazy-load styles. Do not use `??=` fallback chains.

---

## 1. Project Layout

```
app/                  Application code
  Controllers/        Request handlers (factory pattern)
  Models/             ORM models (Model.define)
  Middleware/         App middleware
  Jobs/               Background job services
  Workers/            Queue workers
  Schedules/          Scheduled tasks
  Types/              Shared TypeScript types
config/               Runtime config (database, cache, queue, mail, middleware, ...)
database/             Migrations, seeders, factories
routes/               Route definitions (api.ts)
src/                  Framework core (do not edit in app projects)
tests/                Vitest tests
```

Add new code in `app/`, `routes/`, `config/`, and `database/`. Do not edit `src/` in an app project.

---

## 2. CLI (`zin`)

Use the `zin` CLI to scaffold and run the project. Prefer scaffolding over hand-writing boilerplate.

| Task | Command |
| --- | --- |
| Create a new app | `zin new <name>` |
| Start dev server (Node) | `zin s` (alias of `zin start`) |
| Start dev server (Workers) | `zin s --wg` |
| List routes | `zin routes` |
| Run migrations | `zin migrate` |
| Create a model | `zin cm <ModelName>` |
| Add a column to a migration | `zin am <column> <ModelName>` |
| Scaffold any artifact | `zin add <type> <name>` |
| Install a plugin | `zin plugin install <plugin-id>` |
| Install a plugin (shortcut) | `zin add db:sqlite` |
| Generate a JWT for dev | `zin jwt:dev` |
| Generate env key | `zin key:env` |
| Run the full QA suite | `zin qa` |
| Auto-fix issues | `zin fix` |
| Deploy | `zin deploy` |

`zin add <type>` accepts: `service`, `feature`, `migration`, `model`, `controller`, `routes`, `middleware`, `factory`, `seeder`, or `<category>:<name>` for plugins.

Full reference: [cli-reference](/cli-reference).

---

## 3. Plugins

Plugins add database, cache, queue, mail, storage, and broadcast drivers. Install them through the CLI so the project's plugin registry is updated.

| Plugin ID | Purpose |
| --- | --- |
| `adapter:postgres` | PostgreSQL |
| `adapter:mysql` | MySQL |
| `adapter:sqlite` | SQLite |
| `adapter:mssql` | SQL Server |
| `driver:queue-redis` | Redis queue |
| `driver:queue-rabbitmq` | RabbitMQ queue |
| `driver:queue-sqs` | AWS SQS queue |
| `driver:queue-cloudflare` | Cloudflare queue |
| `driver:cache-redis` | Redis cache |
| `driver:cache-mongodb` | MongoDB cache |
| `driver:mail-nodemailer` | Nodemailer mail |
| `driver:mail-smtp` | SMTP mail |
| `driver:mail-sendgrid` | SendGrid mail |
| `driver:mail-mailgun` | Mailgun mail |
| `driver:storage-s3` | AWS S3 storage |
| `driver:storage-r2` | Cloudflare R2 storage |
| `driver:storage-gcs` | Google Cloud Storage |
| `driver:broadcast-redis` | Redis broadcast |
| `feature:auth` | Auth feature |
| `feature:queue` | Queue feature |

```bash
zin plugin install adapter:postgres
zin add db:sqlite
```

Post-install commands need `ZINTRUST_ALLOW_POSTINSTALL=1`. Use `--package-manager npm|yarn|pnpm` when needed.

Full reference: [plugins](/plugins).

---

## 4. Routing and Middleware

Routes live in `routes/api.ts`. Register them with `Router`.

```ts
import { Router, type IRouter, type MiddlewareKey } from '@zintrust/core';
import { UserController } from '@app/Controllers/UserController';

export function registerRoutes(router: IRouter): void {
  Router.get(router, '/health', healthHandler);

  Router.group<MiddlewareKey>(
    router,
    '/api/v1',
    (r: IRouter) => {
      const users = UserController.create();
      Router.get<MiddlewareKey>(r, '/users', users.index, { middleware: ['auth'] });
      Router.post<MiddlewareKey>(r, '/users', users.store, {
        middleware: ['auth', 'validateUserStore'],
      });
    },
    { middleware: ['rateLimit'] }
  );
}
```

Rules:

- Route `middleware` takes **string names**, not inline functions. Register custom middleware as a named key in `config/middleware.ts`, then reference it by name.
- Built-in keys include `log`, `error`, `security`, `rateLimit`, `sanitizeBody`, `fillRateLimit`, `authRateLimit`, `userMutationRateLimit`, `csrf`, `auth`, `jwt`, `bulletproof`, `validateLogin`, `validateRegister`, `validateUserStore`, `validateUserUpdate`, and `validateUserFill`.
- Path params use `:id`. Greedy params use `:path*`.
- Use `Router.resource(...)` for full REST CRUD.
- Check the route table with `zin routes`.

### Custom middleware

```ts
import { Logger, type Middleware } from '@zintrust/core';

export const RequestTimer: Middleware = async (req, res, next) => {
  const started = Date.now();
  await next();
  Logger.debug('Request timed', { ms: Date.now() - started });
};
```

Register it in `config/middleware.ts` before using it in a route.

Full reference: [routing](/routing), [middleware](/middleware), [route-metadata](/route-metadata).

---

## 5. Controllers

Controllers are factory functions exposed through a frozen object. Do not use classes.

```ts
import {
  ErrorFactory,
  Hash,
  Logger,
  getValidatedBody,
  type IRequest,
  type IResponse,
} from '@zintrust/core';
import { User } from '@app/Models/User';

async function index(_req: IRequest, res: IResponse): Promise<void> {
  const users = await User.all();
  res.json({ data: users });
}

async function store(req: IRequest, res: IResponse): Promise<void> {
  const body = getValidatedBody<{ name: string; email: string; password: string }>(req);
  if (body === undefined) {
    throw ErrorFactory.createValidationError('Request body is required');
  }

  const user = await User.create({
    name: body.name,
    email: body.email,
    password: await Hash.hash(body.password),
  });

  Logger.info('User created', { id: user.getAttribute('id') });
  res.setStatus(201).json({ data: user });
}

async function show(req: IRequest, res: IResponse): Promise<void> {
  const id = Number(req.getParam('id'));
  const user = await User.find(id);
  if (!user) {
    throw ErrorFactory.createNotFoundError('User not found', { id });
  }
  res.json({ data: user });
}

export const UserController = Object.freeze({
  create: () => Object.freeze({ index, store, show }),
});
```

Request and response helpers:

- `req.getParam('id')` reads a route param.
- `req.getQuery('page')` reads a query value.
- `getValidatedBody<T>(req)` returns the validated body or `undefined`.
- `requireValidatedBody<T>(req)` throws if validation middleware did not run.
- `hasValidatedBody(req)` is a type guard.
- `res.setStatus(201).json({...})` sends a JSON response with a status.
- `res.setHeader(name, value)` sets a header.

Full reference: [controllers](/controllers), [request](/request), [request-typing-and-validation](/request-typing-and-validation).

---

## 6. Models (ORM)

Define models with `Model.define(config, methods)`. The methods object receives the model instance as `IModel`.

```ts
import { Model, type IModel } from '@zintrust/core';
import { Post } from '@app/Models/Post';

export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email', 'password'],
    hidden: ['password'],
    timestamps: true,
    softDeletes: false,
    casts: {
      email_verified_at: 'datetime',
    },
  },
  {
    posts(model: IModel) {
      return model.hasMany(Post);
    },
    isAdmin(model: IModel) {
      return model.getAttribute('is_admin') === 1;
    },
  }
);

export default User;
```

Config keys: `table`, `fillable`, `hidden`, `timestamps`, `softDeletes`, `casts`, `connection`, `primaryKey` (for example `{ strategy: 'uuid', key: 'id' }`), and `observers`.

Query and persistence:

```ts
const user = await User.find(1);
const admin = await User.where('email', '=', 'admin@example.com').first();
const created = await User.create({ name: 'Ada', email: 'ada@example.com', password: hash });

user?.setAttribute('name', 'Ada Lovelace');
await user?.save();
await user?.delete();      // soft delete when softDeletes is on
await user?.restore();
await user?.forceDelete();
```

Relationships are instance helpers on `IModel`: `hasOne`, `hasMany`, `belongsTo`, `belongsToMany`, `morphOne`, `morphMany`, `morphTo`, `hasOneThrough`, and `hasManyThrough`.

Rules:

- Always list sensitive columns in `hidden`.
- Only list columns in `fillable` that clients may set. Never put `is_admin` or ids in `fillable`.
- Hash passwords with `Hash.hash(...)` before saving them.
- Eager loading: `.with('posts')`. Counts: `.withCount()`.

Full reference: [models](/models), [query-builder](/query-builder), [orm-advanced-relationships](/orm-advanced-relationships).

---

## 7. Validation

Use `Schema.create()` to build a schema and `Validator` to run it.

```ts
import { Schema, Validator, ValidationError } from '@zintrust/core';

export const createUserSchema = Schema.create()
  .required('name')
  .string('name')
  .minLength('name', 2)
  .maxLength('name', 255)
  .required('email')
  .email('email')
  .required('password')
  .string('password')
  .minLength('password', 8)
  .required('role')
  .in('role', ['admin', 'user', 'guest']);

// Non-throwing check
const ok = Validator.isValid(data, createUserSchema);

// Throwing check
try {
  Validator.validate(data, createUserSchema);
} catch (error) {
  if (error instanceof ValidationError) {
    return error.toObject(); // field -> messages
  }
  throw error;
}
```

Other rules available on the chain: `integer`, `boolean`, `min`, `max`, `uuid`, `url`, `date`, `regex`, and `custom(field, fn, message)`.

Route validation:

- Register a schema as a named middleware key in `config/middleware.ts` (for example `validateUserStore`), then reference the key in the route.
- Or use `ValidationMiddleware.createBody(schema)` when you build your own middleware stack.
- On failure the response is **422** with `{ errors }`.
- On success the body is available through `getValidatedBody(req)`.
- `unique` checks are not supported in rule strings. Check uniqueness in the controller or service after validation.

Full reference: [validation](/validation), [request-typing-and-validation](/request-typing-and-validation).

---

## 8. Sanitizers and XSS

Sanitize every field that will be stored, logged, or rendered. Sanitizers are in `Sanitizer`.

```ts
import { Sanitizer } from '@zintrust/core';

const email = Sanitizer.email(body.email);        // validates and normalizes
const name = Sanitizer.nameText(body.name);
const digits = Sanitizer.digitsOnly(body.phone);
const amount = Sanitizer.parseAmount(body.amount);
const token = Sanitizer.tokenSafe(body.token);
```

Available sanitizers include `email`, `emailLike`, `nameText`, `messageText`, `addressText`, `alphanumeric`, `alphanumericDotDash`, `alphaNumericColonDash`, `digitsOnly`, `decimalString`, `numericDotOnly`, `parseAmount`, `nonNegativeNumericStringOrNull`, `safePasswordChars`, `wordCharsAndSpaces`, `lowercaseAlphanumeric`, `uppercaseAlphanumeric`, `alphanumericNoSpaces`, `dateSlash`, `dateSlashNoSpaces`, `ipAddressText`, `tokenSafe`, `uuidTokenSafe`, and `keyLike`.

Behavior:

- Sanitizers throw `SanitizerError` (`name === 'SanitizerError'`) on invalid input.
- `bulletproof` mode is on by default. Pass `false` only when you have a specific reason.
- Use `ValidationMiddleware.createBodyWithBulletproofSanitization(schema)` to sanitize and validate the body in one step.
- For HTML and URLs, use `Xss.sanitize`, `XssProtection.escape`, `XssProtection.sanitize`, and `XssProtection.isSafeUrl`.

Full reference: [security-sanitizer-bulletproof](/security-sanitizer-bulletproof), [security](/security).

---

## 9. Helpers

Import helpers from `@zintrust/core`. Do not reimplement them.

```ts
import { isNonEmptyString, isInt, isBoolean, isUUID, isEmail } from '@zintrust/core';

if (!isNonEmptyString(body.name)) { /* ... */ }
if (!isInt(query.page, true, { min: 1, max: 100 })) { /* ... */ }
if (!isBoolean(query.active, true)) { /* ... */ }
```

Common helpers: `isObject`, `isArray`, `isNonEmptyString`, `isNonEmptyArray`, `isNonEmptyObject`, `isInt`, `isFloat`, `isNumeric`, `isBoolean`, `isUUID`, `isEmail`, `isUrl`, `isSlug`, `isHexColor`, `isJSON`, `isBase64`, `isIn`, `isNotIn`, `isMinLength`, `isMaxLength`, and `isMatch`.

Semantics to respect:

- `isInt(x)` is a strict number check. `isInt(x, true)` also accepts numeric strings.
- `isBoolean(x)` is strict. `isBoolean(x, true)` also accepts `'true'`, `'false'`, `'1'`, and `'0'`.
- `isEmpty` is legacy. It treats `0` and `'0'` as empty. Prefer `isNonEmptyString` or explicit checks.
- `isNull` and `isUndefinedOrNull` also treat `''` and `'null'` as null-like. Use explicit `=== null || === undefined` when you only mean that.

Full reference: [helpers](/helpers).

---

## 10. Authentication and Security

### Password hashing

```ts
import { Hash } from '@zintrust/core';

const stored = await Hash.hash(plainPassword);       // bcrypt, 12 rounds
const valid = await Hash.compare(plainPassword, stored);
```

`Auth.hash`, `Auth.compare`, `Auth.generateToken`, and `Auth.verifyToken` also exist. Do not invent other `Auth.*` methods such as `Auth.guard`, `Auth.user`, or `Auth.check`; they are not implemented.

### JWT

```ts
import { JwtManager } from '@zintrust/core';

const token = await JwtManager.signAccessToken({ sub: String(user.getAttribute('id')) }, 3600);
```

Environment:

- `JWT_SECRET` (falls back to `APP_KEY`)
- `JWT_ALGORITHM` (default `HS256`)
- `JWT_EXPIRES_IN` (default `3600`)
- `JWT_REVOCATION_DRIVER`: `database` (default), `redis`, `kv`, `kv-remote`, or `memory`

Protect routes with the `auth` or `jwt` middleware keys. For bulletproof auth, use the `bulletproof` key and see the Bulletproof docs.

### Login flow

`LoginFlow` gives a staged pipeline: `identify() -> verify() -> issue() -> audit() -> run()`. Register providers before use. Follow [plug-and-play-auth-login](/plug-and-play-auth-login) for the exact shape.

### JWKS verification

`JwtVerifier.verifyWithJwks({ token, jwksUrl, issuer, audience })` verifies tokens from an external identity provider. See [jwk-jwt-verification](/jwk-jwt-verification).

### CSRF and rate limits

- `csrf` protects state-changing routes that use cookies.
- `rateLimit`, `fillRateLimit`, `authRateLimit`, and `userMutationRateLimit` limit request rates. Apply `authRateLimit` to login and register routes.

Full reference: [authentication](/authentication), [bulletproof-auth](/bulletproof-auth), [security-middleware](/security-middleware), [rate-limiting](/rate-limiting).

---

## 11. Errors

Use `ErrorFactory` for every error. Throw it. The framework turns it into a structured JSON response.

| Method | Status | Use |
| --- | --- | --- |
| `ErrorFactory.createValidationError(msg, details?)` | 400 | Invalid input |
| `ErrorFactory.createUnauthorizedError(msg?, details?)` | 401 | Not authenticated |
| `ErrorFactory.createForbiddenError(msg?, details?)` | 403 | Not allowed |
| `ErrorFactory.createNotFoundError(msg?, details?)` | 404 | Missing resource |
| `ErrorFactory.createSecurityError(msg, details?)` | 401 | Security check failed |
| `ErrorFactory.createSanitizerError(method, reason, value)` | 400 | Sanitizer rejected input |
| `ErrorFactory.createDatabaseError(msg, details?)` | 500 | Database failure |
| `ErrorFactory.createConfigError(msg, details?)` | 500 | Missing or invalid config |
| `ErrorFactory.createConnectionError(msg, details?)` | 500 | Network failure |
| `ErrorFactory.createWorkerError(msg, details?)` | 500 | Worker failure |
| `ErrorFactory.createGeneralError(msg, details?)` | 500 | Other server errors |

```ts
throw ErrorFactory.createNotFoundError('User not found', { id });
```

Full reference: [health-checks](/health-checks), [troubleshooting-workers](/troubleshooting-workers).

---

## 12. Logging and Config

### Logging

```ts
import { Logger } from '@zintrust/core';

Logger.info('User logged in', { userId: 1 });
Logger.warn('Rate limit approaching', { requests: 950 });
Logger.error('Query failed', error);

const log = Logger.scope('UserController');
log.info('Lookup', { id });
```

Sensitive fields are redacted automatically: `password`, `token`, `authorization`, `secret`, `apikey`, `api_key`, `jwt`, and `bearer`.

Environment: `LOG_LEVEL` (`debug|info|warn|error`, default `info`), `LOG_FORMAT` (`text|json`, default `text`), `DISABLE_LOGGING=true`.

### Environment

```ts
import { Env } from '@zintrust/core';

const port = Env.getInt('PORT', 3000);
const debug = Env.getBool('FEATURE_X', false);
const driver = Env.get('CACHE_DRIVER', 'memory');
```

Never hard-code secrets. Read them from `Env` and set them in your environment or secret store.

Full reference: [logging](/logging), [configuration](/configuration), [config-env](/config-env).

---

## 13. Services

Use the framework service for each job. Do not build a parallel client.

### Mail

```ts
import { Mail } from '@zintrust/core';

await Mail.send({
  to: 'user@example.com',
  subject: 'Welcome',
  text: 'Welcome to ZinTrust!',
});
```

Templates: `zin make:mail-template`. Reference: [mail](/mail), [mail-templates](/mail-templates).

### Queue

```ts
import { Queue } from '@zintrust/core';

await Queue.enqueue('emails', { to: 'user@example.com', template: 'welcome' });
```

Register drivers with `Queue.register(name, driver)` or install a `driver:queue-*` plugin. Run workers to process jobs. Reference: [queue](/queue), [queue-prevention-mechanisms](/queue-prevention-mechanisms).

### Storage

```ts
import { Storage } from '@zintrust/core';

const disk = Storage.getDisk('local');
```

Reference: [storage](/storage).

### Cache

```ts
import { cache } from '@zintrust/core';

await cache.set('user:1', { id: 1, name: 'Ada' }, 3600); // TTL in seconds
const user = await cache.get('user:1');
```

Reference: [cache](/cache).

### Notification

```ts
import { Notification } from '@zintrust/core';

await Notification.send('+15551234567', 'Hello from ZinTrust');
```

Reference: [notification](/notification).

### Broadcast

Use `Broadcast.publish(...)` for immediate delivery and `Broadcast.publishLater(...)` for queued delivery. Reference: [broadcast](/broadcast).

### HTTP client

```ts
import { HttpClient } from '@zintrust/core';

const response = await HttpClient.get('https://api.example.com/users/1').send();
```

Reference: [http-client](/http-client).

---

## 14. Testing

- Test with Vitest. Run `npm test`.
- Mock `@config/logger` in tests to keep output quiet.
- Restore any `process.env` values you change.
- For env-dependent modules, set env, call `vi.resetModules()`, re-import, then restore.
- Import the module under test from its source path. For package-level tests, import from `@zintrust/core`.

Reference: [testing](/testing), [testing-http](/testing-http).

---

## 15. Before You Finish (QA Checklist)

Run these checks and fix failures before you report the work as done:

```bash
npm test
npm run type-check
npm run lint
npm run -s coverage:patch   # focus on changed code
zin qa                      # full suite, writes an HTML report
```

Confirm each item:

- [ ] Runs on Node (`zin s`) and Workers (`zin s --wg`)
- [ ] No `new Error(...)`, no `console.*`, no `node:*` imports in app code
- [ ] Every external input is validated and sanitized
- [ ] Sensitive model fields are in `hidden`; `fillable` is minimal
- [ ] Passwords are hashed with `Hash.hash` and never logged
- [ ] Protected routes use `auth`, `jwt`, or `bulletproof`
- [ ] Routes are registered and visible in `zin routes`
- [ ] New tests pass and changed code is covered

---

## 16. Anti-Patterns

Do not:

- Create classes in app code.
- Add `new Error(...)`, `console.log`, or raw `node:` imports.
- Reimplement helpers that already exist in `@zintrust/core`.
- Use `isEmpty` to check for empty strings or numbers.
- Put user-controlled data in `fillable` without validation.
- Return model objects that include hidden fields.
- Invent `Auth.*` or `Model` methods. Check the docs first.
- Edit files under `src/` in an app project.
- Skip QA because the change looks small.

When unsure about an API, check the linked docs above before writing code.
