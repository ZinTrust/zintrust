# Installation & Setup

## Prerequisites

- Node.js `>= 20`
- npm `>= 9` (recommended)

Optional (but often required): build tools for native dependencies (for example `bcrypt`, `better-sqlite3`). On macOS, Xcode Command Line Tools are usually sufficient.

## Install ZinTrust

You can install ZinTrust globally (recommended for getting started) or per-project.

### Option A: Global install

```bash
npm install -g @zintrust/core
```

This provides the CLI entrypoints:

- `zin` (primary)
- `z` and `zt` (shorthands)
- `zintrust` (full name)

Verify:

```bash
zin --version
```

### Option B: Project-local install

If you prefer reproducible tooling per repo:

```bash
npm install --save-dev @zintrust/core
```

Then run the CLI via:

```bash
npx zin --version
```

## Create your first project

Interactive (recommended):

```bash
zin new my-app
cd my-app
```

Scripted (CI / automation):

```bash
zin new my-app \
	--template api \
	--database postgresql \
	--port 7777 \
	--governance \
	--no-interactive
```

`zin new` can also control:

- git init: `--no-git`
- dependency install: `--no-install` or `--install`
- package manager: `--package-manager npm|yarn|pnpm`

## Install adapters and drivers (plugin-style)

Many integrations are installed on-demand using the `domain:driver` form:

```bash
zin add db:sqlite
zin add queue:redis
zin add broadcast:redis
zin add cache:redis
zin add mail:nodemailer
```

Some drivers are native modules; if installs fail, ensure your machine has build tooling available.

## Start the app

From a generated project:

```bash
zin start
```

If you are running the framework repo directly, `npm run dev` starts the dev server.
