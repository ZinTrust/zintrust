# Testing Service Swaps

In tests, you often want to swap real dependencies (DB, cache, mailer, HTTP clients) for fakes.

Zintrust’s `TestEnvironment` helper includes a container override mechanism so you can do this cleanly without rewriting production wiring.

See `tests/helpers/TestEnvironment.ts`.

## How swapping works

`TestEnvironment.create()` builds an _overridable_ container wrapper around a base `ServiceContainer`.

It exposes two helpers:

- `env.swapSingleton(key, instance)`
- `env.swapFactory(key, factory)`

Each returns an **undo function** that removes the override.

The override applies only to `container.resolve(key)` / `container.get(key)` calls made after the swap, and only within that test environment instance.

## Example: swap a singleton

```ts
import { expect, it } from 'vitest';
import { TestEnvironment } from '@/tests/helpers/TestEnvironment';

it('uses fake mailer', async () => {
  const env = TestEnvironment.create();

  const fakeMailer = {
    send: async () => ({ ok: true }),
  };

  const restore = env.swapSingleton('mailer', fakeMailer);
  try {
    // execute code that resolves 'mailer'
    // ...
  } finally {
    restore();
  }
});
```

## Example: swap a factory

Factories are useful when the service should be “fresh” per resolve.

```ts
const restore = env.swapFactory('clock', () => ({ now: () => 1_700_000_000 }));
// ...
restore();
```

## Recommended patterns

- Keep swaps **local to a test** (call the undo function).
- Prefer swapping at the **boundary** (e.g. mailer client) rather than deep internal helpers.
- If multiple tests need the same swap, wrap it in a helper that returns the undo function.

## Gotchas

- If you swap after some code has already resolved and cached a singleton internally, your swap may not affect that cached instance. Swap early (before the system under test boots/resolves its dependencies).
- `env.container.flush()` clears overrides and flushes the underlying container; use it if you need a clean slate between sub-scenarios.
