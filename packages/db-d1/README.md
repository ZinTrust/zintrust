# @zintrust/db-d1

Cloudflare D1 database adapter package for Zintrust.

## Install

```bash
npm i @zintrust/db-d1
```

## Usage

Register the adapter at startup:

```ts
import '@zintrust/db-d1/register';
```

Then select the adapter in your config/env (the registered driver key is `d1`).

Note: D1 is a Cloudflare Workers binding (not a TCP database). You typically use this inside a Worker with a D1 binding (commonly named `DB`).

## Docs

- https://zintrust.com/cloudflare
- https://zintrust.com/adapters
