# Fix: `@zintrust/redis-rpc` not bundled in Cloudflare Workers + `node:http` incompatibility

## Packages affected

- `packages/redis-rpc` — `client.ts`
- `packages/queue-redis` — `src/RedisRpcQueueDriver.ts`

---

## Problem 1 — `@zintrust/redis-rpc` not bundled (queue-redis)

### Symptom

At runtime in the Cloudflare Workers environment the dynamic import inside `createRpcClient` throws, which is caught and re-thrown as:

```
@zintrust/redis-rpc is required when USE_REDIS_PROXY=true and REDIS_RPC_URL is configured
```

### Cause

`RedisRpcQueueDriver.ts` used a module-level `const` as the import specifier:

```ts
const REDIS_RPC_PACKAGE = '@zintrust/redis-rpc';
// ...
const mod = (await import(REDIS_RPC_PACKAGE)) as unknown as RedisRpcModule;
```

esbuild (used by Wrangler) does **not** statically bundle modules referenced through a variable specifier — this is the same intentional pattern used elsewhere to keep `bullmq`/`ioredis` out of the Workers bundle. Because `@zintrust/redis-rpc` was never included in the bundle, the dynamic import had nothing to resolve at runtime.

### Fix

Replace the variable-specifier dynamic import with a direct string pointing at the `/client` sub-path (avoids pulling in the server-side `bullmq`/`ioredis` code):

```ts
// before
const REDIS_RPC_PACKAGE = '@zintrust/redis-rpc';
// ...
const mod = (await import(REDIS_RPC_PACKAGE)) as unknown as RedisRpcModule;
return mod.createRedisRpcClient({ ... });

// after
const { createRedisRpcClient } = await import('@zintrust/redis-rpc/client');
return createRedisRpcClient({ ... });
```

Remove the now-unused `REDIS_RPC_PACKAGE` constant and the `RedisRpcModule` intermediate type.

---

## Problem 2 — `node:http` / `node:https` not suitable for Workers (redis-rpc)

### Cause

`client.ts` used the Node.js callback-based `http.request()` / `https.request()` API:

```ts
import http from 'node:http';
import https from 'node:https';

const requestJson = (url, body, headers) => {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, { method: 'POST', agent: false, headers: { ...headers, 'content-length': ... } }, (response) => {
      const chunks: string[] = [];
      response.setEncoding('utf8');
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => { ... });
    });
    request.on('error', (error) => reject(...));
    request.end(body);
  });
};
```

The `node:http` module is available in Workers via `nodejs_compat`, but its callback/stream-based `request()` path is not reliably supported. The Workers runtime is built around the Fetch API.

`randomUUID` was also imported from `node:crypto`, which adds an unnecessary Node.js built-in dependency when `globalThis.crypto.randomUUID()` is available in both Workers and Node.js ≥ 18 (this package requires ≥ 20).

### Fix

Replace the entire `requestJson` implementation with `fetch()` and switch `randomUUID` to the global `crypto` object:

```ts
// removed imports
// import { randomUUID } from 'node:crypto';
// import http from 'node:http';
// import https from 'node:https';

const requestJson = async (url: URL, body: string, headers: Record<string, string>): Promise<RequestJsonResult> => {
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body });
  } catch (error) {
    throw ErrorFactory.createConnectionError('Redis RPC request failed', { error });
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Redis RPC response read failed', { error });
  }
  try {
    return {
      statusCode: response.status,
      ok: response.ok,
      body: isUndefinedOrNull(text.trim()) ? {} : JSON.parse(text),
    };
  } catch (error) {
    throw ErrorFactory.createTryCatchError('Redis RPC response parse failed', { error });
  }
};

// inside createRedisRpcClient → client.call:
requestId: globalThis.crypto.randomUUID(),
```

`fetch()` is available globally in both Cloudflare Workers and Node.js ≥ 18, so no runtime branching is needed.

---

## Problem 3 — `BULLMQ_REMOVE_ON_COMPLETE` env ignored on RPC path + `||` swallows explicit `0` (queue-redis)

### Cause

`createJobOptions` in `RedisRpcQueueDriver.ts` read neither `BULLMQ_REMOVE_ON_COMPLETE` nor the other `BULLMQ_*` env vars — those were only wired into `defaultJobOptions` on the direct BullMQ Queue constructor path. Jobs dispatched via the RPC path therefore ignored the env entirely.

Additionally, using `||` instead of `??` caused `0` (remove-immediately semantics in BullMQ) to be silently replaced by the fallback:

```ts
// before — 0 || 100 → 100, env never read
removeOnComplete: payloadData.removeOnComplete || 100,
removeOnFail: payloadData.removeOnFail || 50,
```

### Fix

Switch to `??` (nullish coalescing) and read the same `BULLMQ_*` env vars that the direct path uses, keeping behaviour consistent regardless of which path is active:

```ts
// after
attempts: payloadData.attempts ?? Env.getInt('BULLMQ_DEFAULT_ATTEMPTS', 3),
removeOnComplete: payloadData.removeOnComplete ?? Env.getInt('BULLMQ_REMOVE_ON_COMPLETE', 100),
removeOnFail: payloadData.removeOnFail ?? Env.getInt('BULLMQ_REMOVE_ON_FAIL', 50),
backoff: payloadData.backoff || {
  type: Env.get('BULLMQ_BACKOFF_TYPE', 'exponential') as 'exponential' | 'fixed',
  delay: Env.getInt('BULLMQ_BACKOFF_DELAY', 2000),
},
```

`??` only falls back when the payload value is `null` or `undefined`, so an explicit `0` (keep no completed jobs) is now honoured correctly.
