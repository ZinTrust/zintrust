# Plug & Play Performance Guide

Plug & Play features only help if they stay operationally boring in production.

This page documents the non-negotiable runtime rules for every Plug & Play surface.

## State ownership

1. prefer invocation-scoped state
2. prefer request-scoped memoization over process-global caches
3. add explicit cleanup for any long-lived registry or retained history

## Retention limits

1. no unbounded arrays or maps for job history, notifications, or loader caches
2. add TTL or capacity limits when retention is necessary
3. keep retained payload metadata minimal

## Observability

1. emit structured logs through `Logger.*`
2. use low-cardinality metrics
3. expose normalized stage or status values that can be aggregated easily

## Validation

Before shipping a Plug & Play runtime feature, verify:

1. `npm test`
2. `npm run type-check`
3. `npm run lint`
4. `npm run -s coverage:patch`
5. explicit smoke checks for both `zin s` and `zin s --wg`

## Examples of good boundaries

### Good

```ts
const payload = await SecurePayload.decode(raw, { decryptor: 'default' }).decrypt().json().typed();
```

The pipeline state is dropped once the promise resolves.

### Bad

```ts
globalDecodedPayloads.push(payload);
```

That turns a reusable workflow into an unbounded memory sink.
