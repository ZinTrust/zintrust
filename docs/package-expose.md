---
title: Expose
description: Secure tunnel CLI extension for sharing local ZinTrust development environments
---

# Expose

The `@zintrust/expose` package provides the official ZinTrust CLI tunnel extension for exposing local environments to the internet during development. It is intended for webhook testing, mobile-device checks, and short-lived demos without deploying the app.

## What it provides

- `zin expose` and `zin exp` CLI commands
- Cloudflare tunnel support for fast ephemeral public URLs
- ZinTrust tunnel-provider support for authenticated developer workflows
- Automatic cleanup when the tunnel session exits

## Basic usage

```bash
zin expose [port] [options]
```

## Common examples

```bash
zin exp
zin exp 8080 --provider cloudflare
zin expose 3000 --provider zintrust
```

## More detail

For provider behavior, CLI options, and the runtime registration model, see `https://www.npmjs.com/package/@zintrust/expose?activeTab=readme`.
