# Architecture & Design

Zintrust is built on a minimal core (no Express/Fastify), focusing on performance and type safety. The published npm package also includes a small set of runtime dependencies for the CLI and developer experience.

## Core Principles

- Zero external dependencies for core logic
- (CLI/DX note) The `@zintrust/core` npm package includes dependencies for the CLI and scaffolding UX
- Strict TypeScript enforcement
- Microservices-first architecture
- Native Node.js performance

## Plain Functions + Frozen Function-Objects

Zintrust intentionally avoids class-heavy frameworks in its core and instead leans on:

- Plain functions for behavior
- “Function-objects” (a plain object of functions exported as a sealed namespace)

Typical pattern:

```ts
export const Feature = Object.freeze({
  doThing,
  doOtherThing,
});
```

This gives you a stable API surface (no accidental mutation) while keeping the implementation simple and dependency-light.

### Why this pattern is useful

- Fewer hidden runtime footguns: avoids `this` binding issues and inheritance edge cases.
- Easier testing: functions are easy to unit test; function-objects are easy to stub/spy in a controlled way.
- Better composition: encourages composition over inheritance (small pieces wired together explicitly).
- Predictable dependency flow: dependencies can be passed as arguments instead of living on instance state.
- TypeScript friendliness: strong inference for “data in / data out” functions and narrow return types.
- Runtime portability: plain objects + functions work cleanly across Node, workers, and serverless runtimes.

### Why modern teams migrate toward plain functions

In many codebases, class-based designs drift into deep inheritance, implicit state, and “magic” lifecycles.
Modern TypeScript and ESM make it straightforward to model most app logic as:

- A functional core (pure-ish logic)
- With an imperative shell (I/O, HTTP, storage, queues)

Plain functions also make refactors cheaper: you can move behavior without worrying about subclass contracts, method overriding, or implicit constructor side effects.

### Microservices advantage (smaller pieces, clearer boundaries)

Plain functions and frozen function-objects also map cleanly to microservice architectures:

- Easy to split: a “service” can start as a single module (`Object.freeze({ ... })`) and later be split into smaller modules without redesigning inheritance trees.
- Clear seams for extraction: pure-ish functions become shared packages, while runtime-specific adapters stay inside each service.
- Fewer cross-service coupling traps: when behavior is expressed as functions with explicit inputs/outputs, it’s harder to accidentally rely on hidden instance state.
- Simpler packaging: small function modules bundle and tree-shake well, which helps when you deploy many small services.

### Migration guidance (from class-based code)

- Prefer factories over constructors: `createService({ deps })` returning `{ fn1, fn2 }`.
- Replace inheritance with composition: build features by combining small modules.
- Keep state explicit: pass state/dependencies in, return data out.
- Seal public APIs: export `Object.freeze({ ... })` so consumers rely on stable surfaces.
