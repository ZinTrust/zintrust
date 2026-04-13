# @zintrust/expose

The `@zintrust/expose` package provides an official ZinTrust CLI extension to instantly expose your local development environment to the internet via secure tunnels.

Docs: https://zintrust.com/package-expose

It allows you to share your work with clients, test webhooks, or test on mobile devices without deploying your application.

## Prerequisites

This package requires a ZinTrust project using `@zintrust/core` `^0.4.0` or higher to run. By default, standard templates include and load this package automatically.

## Usage

Use the global `zin` command (or `npx tsx bin/zin.ts`) in your application root to invoke the `expose` CLI command (also aliased as `exp`).

### Basic Command

```bash
zin expose [port] [options]
```

### Options

- `[port]`: The local port you want to expose. If omitted, ZinTrust will attempt to read `process.env.PORT` from your `.env` file, defaulting to `3000` otherwise.
- `--provider <provider>`: The backend tunneling service to use. Supports `cloudflare` or `zintrust`. (Default: `cloudflare`)
- `--https`: Enable if the local target you are exposing expects HTTPS traffic (e.g., exposing a local self-signed dev server).

---

## Tunnel Providers

The package ships with two native tunneling providers:

### 1. Cloudflare Tunnels (Default)

The `cloudflare` provider utilizes Cloudflare's `cloudflared` utility behind the scenes to spawn rapid, ephemeral tunnels. It's incredibly fast and requires no authentication, granting you a randomized `.trycloudflare.com` URL instantly.

**Examples:**

Expose the default port (automatically read from `.env`):

```bash
zin exp
```

Explicitly expose port `8080` via Cloudflare:

```bash
zin exp 8080 --provider cloudflare
```

Expose a local HTTPS container running on port `443`:

```bash
zin exp 443 --https
```

### 2. ZinTrust Tunnels

The `zintrust` provider connects to the ZinTrust internal tunneling network. This is useful for authenticated developer environments, persistent subdomains, and connecting services inside the ZinTrust ecosystem.

**Examples:**

Expose port `3000` using the native ZinTrust tunnel:

```bash
zin expose 3000 --provider zintrust
```

Expose your local environment via ZinTrust securely over HTTPS:

```bash
zin exp --https --provider zintrust
```

## How It Works Under The Hood

ZinTrust registers `@zintrust/expose` as an _Optional CLI Extension_. When the framework bootstraps `bin/zin.ts`, the package exposes its provider definitions `ITunnelProvider` through `TunnelManager`.

When a tunnel is requested, a child process hooks into the requested provider (like `cloudflared`), safely negotiating the handshake and parsing the generated secure URL back to the developer console. When the CLI is exited (via `Ctrl+C`), the package safely and automatically cleans up the tunnel child processes.
