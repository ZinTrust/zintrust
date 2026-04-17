# Plug & Play Context Loader

`ContextLoader.create()` is the ZinTrust Plug & Play surface for repeated multi-model context assembly.

It provides dependency-ordered `load(...)` resolution, request-scoped memoization, and optional shared batch loading without pretending that every graph becomes one SQL query.

## Available runtime

```ts
import { ContextLoader } from '@zintrust/core';

const loader = ContextLoader.create({ mode: 'batch' }).batch(
  'profilesByUserId',
  async (userIds) => {
    const profiles = await Profile.whereIn('user_id', userIds).get();
    return new Map(profiles.map((profile) => [String(profile.user_id), profile]));
  }
);

const context = await loader
  .load('user', async () => User.find(userId))
  .load('profile', async ({ user }) => {
    const currentUser = user as { id?: string } | null;
    return currentUser?.id ? loader.fromBatch('profilesByUserId', currentUser.id) : null;
  })
  .load('wallet', async ({ user }) => {
    const currentUser = user as { id?: string } | null;
    return currentUser?.id ? Wallet.where('user_id', '=', currentUser.id).first() : null;
  })
  .resolve();
```

## What the core owns

`ContextLoader` provides:

1. dependency-ordered `load(...)` execution
2. request-scoped `resolve()` memoization per plan
3. optional shared batch registration through `.batch(...)`
4. `fromBatch(...)` fan-out loading that can coalesce concurrent requests on one loader instance
5. consistent `null` results for missing batch values

## What the application still owns

Applications still decide:

1. whether plain relationship eager loading is the better abstraction
2. which models or services belong in the context graph
3. how batched data is grouped and keyed
4. how null or missing values should affect downstream business logic

## Product-fit boundaries

1. `ContextLoader` does not guarantee a single SQL query
2. `ContextLoader` does not replace ORM relationships
3. `ContextLoader` is most useful when one action needs repeated multi-model coordination or shared fan-out batching

## Related docs

1. Use [models](/models) and [orm-advanced-relationships](/orm-advanced-relationships) when one ORM root can express the graph directly.
2. Use [plug-and-play-performance](/plug-and-play-performance) for the retention rules that keep request-scoped loaders bounded.
