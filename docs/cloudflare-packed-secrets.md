# Cloudflare Packed Secrets

ZinTrust supports a packed secret mode for Cloudflare Workers and local Node development.

This mode lets you store multiple flat env values inside one or more JSON string bindings while keeping the normal `Env.get(...)` and `RuntimeServices.create(...).env` API unchanged.

Use this when your Cloudflare Worker receives secrets as packed JSON bindings instead of one binding per key, or when you want local development to mimic that layout.

## What it does

When `USE_PACK=true`, ZinTrust:

1. reads the comma-separated binding names listed in `PACK_KEYS`
2. parses each listed binding as a JSON object
3. flattens the object into the resolved env view used by `Env.get(...)`
4. applies later packs over earlier packs
5. applies direct env values over packed values

That means existing code can keep doing this:

```ts
import { Env, RuntimeServices } from '@zintrust/core';

const appKey = Env.get('APP_KEY');
const jwtSecret = Env.get('JWT_SECRET');

const services = RuntimeServices.create('cloudflare');
const sessionSecret = services.env.get('SESSION_SECRET');
```

No code changes are needed in the consumer once the runtime env is packed correctly.

## Required control keys

| Key         | Required | Description                                                     |
| ----------- | -------- | --------------------------------------------------------------- |
| `USE_PACK`  | yes      | Must be `true` to enable packed resolution.                     |
| `PACK_KEYS` | yes      | Comma-separated list of env keys whose values are JSON objects. |

Example:

```env
USE_PACK=true
PACK_KEYS=WORKER_SECRETS,WORKER_OVERRIDES
```

## Cloudflare Worker example

In Worker bindings, each pack key should contain a JSON object string.

```jsonc
{
  "vars": {
    "USE_PACK": "true",
    "PACK_KEYS": "WORKER_SECRETS,WORKER_OVERRIDES",
    "WORKER_SECRETS": "{\"APP_KEY\":\"base-secret\",\"JWT_SECRET\":\"jwt-secret\",\"SESSION_SECRET\":\"session-secret\"}",
    "WORKER_OVERRIDES": "{\"JWT_SECRET\":\"override-secret\"}",
    "APP_NAME": "My Worker",
  },
}
```

Resolved result:

- `APP_KEY` comes from `WORKER_SECRETS`
- `SESSION_SECRET` comes from `WORKER_SECRETS`
- `JWT_SECRET` comes from `WORKER_OVERRIDES`
- `APP_NAME` comes from the direct binding and overrides any packed value with the same key

## Local development with `.env.pack`

ZinTrust now auto-loads `.env.pack` during CLI/local Node env bootstrap.

Use `.env` for the control keys and any direct overrides:

```env
USE_PACK=true
PACK_KEYS=LOCAL_PACK
APP_NAME=My Local App
```

Use `.env.pack` for the packed JSON payloads:

```env
LOCAL_PACK={"APP_KEY":"local-app-key","JWT_SECRET":"local-jwt-secret","SESSION_SECRET":"local-session-secret"}
```

Important behavior:

1. `.env.pack` is loaded after the normal `.env*` files.
2. `.env.pack` does not override the control keys `USE_PACK` or `PACK_KEYS`.
3. Direct env values still win over packed values.

## Resolution rules

Packed env resolution follows these rules in order:

1. If `USE_PACK` is not `true`, packed mode is disabled.
2. `PACK_KEYS` is split by comma, trimmed, and de-duplicated.
3. Each referenced pack must exist and must parse to a JSON object.
4. Each pack value must be flat and string-compatible.
5. Later pack entries override earlier pack entries.
6. Direct env values override all packed values.

## Supported packed values

Supported value types inside a pack:

- string
- number
- boolean
- bigint

Unsupported value types:

- nested objects
- arrays
- `null`
- `undefined`

If a pack contains nested or null-like values, ZinTrust throws a config-style startup error.

## Diagnostics

You can inspect the resolved env state and source of each key.

```ts
import { Env } from '@zintrust/core';

const jwtSecret = Env.get('JWT_SECRET');
const jwtSecretSource = Env.getSourceOf('JWT_SECRET');
const hasSessionSecret = Env.has('SESSION_SECRET');
const optionalKey = Env.getOptional('SOME_OPTIONAL_KEY');
const resolved = Env.getResolvedState();
const sources = Env.snapshotSources();
```

Useful helpers:

| API                      | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `Env.getOptional(key)`   | returns `undefined` when the key is not resolved           |
| `Env.has(key)`           | checks whether a resolved key exists                       |
| `Env.getSourceOf(key)`   | returns `direct-env` or the winning pack key               |
| `Env.snapshotSources()`  | returns the current key-to-source map                      |
| `Env.getResolvedState()` | returns resolved values, sources, and packed-mode metadata |

## Example diagnostic flow

```ts
import { Env } from '@zintrust/core';

const state = Env.getResolvedState();

console.log(state.packedEnabled);
console.log(state.packedKeys);
console.log(Env.getSourceOf('APP_KEY'));
console.log(Env.getSourceOf('JWT_SECRET'));
```

## Common mistakes

1. `USE_PACK=true` with an empty `PACK_KEYS` value.
2. Referencing a pack name in `PACK_KEYS` without defining that env key.
3. Putting nested JSON inside a pack.
4. Expecting `.env.pack` to override `USE_PACK` or `PACK_KEYS`.
5. Forgetting that direct env values intentionally override packed values.

## When to use this mode

Use packed secrets when:

- Cloudflare secret delivery is easier as one or a few JSON bindings
- you want Worker and local development to resolve secrets the same way
- you want to keep consumer code on the standard `Env` API

Do not use packed mode when separate flat bindings are simpler for your deployment pipeline.
