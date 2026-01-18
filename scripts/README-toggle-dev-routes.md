# Toggle Dev Routes Script

This script automatically comments out and restores dev/test routes during the build process to exclude them from production builds.

## What it does

The script modifies [routes/api.ts](../routes/api.ts) to comment/uncomment:

1. `import { registerDevRoutes, registerTestRoutes } from '@routes/apiDev';`
2. `registerDevRoutes(router);`
3. `registerTestRoutes(pr);`

## Usage

### Manual usage

```bash
# Comment out dev routes (before build)
node scripts/toggle-dev-routes.mjs comment

# Restore dev routes (after build)
node scripts/toggle-dev-routes.mjs uncomment
```

### Automatic usage via npm scripts

The script is automatically invoked via npm hooks:

```bash
# Regular build (auto-toggles)
npm run build

# CI build (auto-toggles)
npm run build:ci

# Production build (auto-toggles)
npm run pro:build
```

## How it works

1. **prebuild** - Runs `node scripts/toggle-dev-routes.mjs comment` before the build starts
2. **build** - Executes the normal build process
3. **postbuild** - Runs `node scripts/toggle-dev-routes.mjs uncomment` after the build completes

This ensures dev/test routes are:

- ✅ Excluded from production builds
- ✅ Always available in your source code for development
- ✅ Automatically restored even if build fails (via npm's lifecycle hooks)

## Safety features

- Idempotent - safe to run multiple times
- Reports what it's doing with clear console output
- Skips if already in desired state
- Preserves indentation and formatting
