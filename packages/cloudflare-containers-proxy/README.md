# @zintrust/cloudflare-containers-proxy

Cloudflare Containers + Durable Object gateway for the ZinTrust proxy stack.

## What this provides

- A Worker `fetch` handler that routes by path prefix (`/mysql/*`, `/postgres/*`, etc.)
- Container-backed Durable Object classes (one per proxy service)

## Typical usage (in an app repo)

1. Install:

```bash
npm i @zintrust/cloudflare-containers-proxy
```

2. Create a local Worker entry file that re-exports the package:

```ts
// src/containers-proxy.ts
export { default } from '@zintrust/cloudflare-containers-proxy';
export * from '@zintrust/cloudflare-containers-proxy';
```

3. Point your `wrangler.containers-proxy.jsonc` `main` to that file.

## CLI flow (recommended)

If your app uses the ZinTrust CLI:

```bash
zin init:containers-proxy
npm i @zintrust/cloudflare-containers-proxy
zin docker -c wrangler.containers-proxy.jsonc -e staging
zin deploy:ccp
```
