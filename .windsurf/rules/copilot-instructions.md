## ZinTrust – Copilot instructions (repo-specific)

### Big picture

- ZinTrust is a TypeScript ESM backend framework with a minimal core and optional adapters in packages/ (db/cache/queue/mail/storage). The published core avoids Express/Fastify while the CLI/DX live in bin/ and src/cli/.
- Project layout: app/ (app code), routes/ (route definitions), src/ (framework + services), packages/ (adapters). See the structure in README.md and adapter READMEs.

### Conventions & patterns (follow these)

- Always spell the brand as ZinTrust in docs/comments.
- Never use the word Laravel always use general word in docs/comments/code expect in plans or todos md.
- Runtime: Node >= 20; ESM. Use path aliases from tsconfig.json and prefer @node-singletons/\* wrappers for Node builtins (src/node-singletons/).
- Style: prefer plain functions + factories; avoid class in src/, app/, routes/, bin/. Many modules expose sealed namespaces via Object.freeze (see src/routing/Router.ts, src/config/logger.ts, src/orm/Model.ts).
- Routing: create routers with Router.createRouter() and register via Router.get/post/put/patch/del/any. Group/resources via Router.group() + Router.resource(); per-route middleware is metadata like { middleware: ['name'] } (see routes/api.ts).
- ORM: define models with Model.define(config, methodsOrPlan); relationships are instance helpers on IModel (hasMany, belongsTo, etc.) (see src/orm/Model.ts).
- Validation: Schema.create() + Validator.\* (see src/validation/Validator.ts).
- Errors: avoid new Error(...) outside tests; use ErrorFactory.\* from src/exceptions/ZintrustError.ts.
- Logging: prefer Logger.\* from src/config/logger.ts (redacts sensitive fields; supports text/JSON + optional file/cloud sinks).

### Workflows & tooling

- Tests are Vitest with global setup in tests/vitest.setup.ts. When writing tests, import from src/index (not @zintrust/core) to cover the build output path.
- Fast loop: npm test, npm run type-check, npm run lint. Full build: npm run build (runs tests + templates:check + tsc + tsc-alias).
- CLI entrypoints: bin/zin.ts (primary) and bin/z.ts (shorthand). Command wiring lives in src/cli/CLI.ts; zin qa runs lint/type-check/tests/Sonar and writes an HTML report (src/cli/commands/QACommand.ts).

### Examples to copy from

- Sealed namespace patterns: src/routing/Router.ts, src/config/logger.ts, src/orm/Model.ts.
- Router conventions: routes/api.ts.
- Testing sealed namespaces: tests/unit/PluginManager.PathTraversal.test.ts.
