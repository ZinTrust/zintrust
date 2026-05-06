# ZinTrust VS Code Extensions Workspace

This folder contains the ZinTrust VS Code extension workspace.

## Extensions

- `zintrust-core`
- `zintrust-routes-explorer`
- `zintrust-orm-migrations-studio`
- `zintrust-workers-queue-console`
- `zintrust-trace-runtime-debugger`
- `zintrust-cloudflare-toolkit`
- `zintrust-secrets-environment-manager`
- `zintrust-notifications-templates-studio`
- `zintrust-adapter-installer`
- `zintrust-project-doctor`
- `zintrust-upgrade-assistant`
- `zintrust-docs-recipes`
- `zintrust-developer-pack`

## Local Development

Run from this folder:

```bash
npm install
npm run compile
npm run test
npm run validate
```

The `zintrust-core` extension now acts as the discoverability hub for the suite with an Explorer view, a status bar entry, and a dashboard webview that surfaces the most common project files and workflows.

## Validation

- `npm run test` compiles the workspace, validates command registration, and runs focused per-extension behavior checks with a mocked VS Code API.
- `npm run validate` runs compile and package for each extension one by one and verifies release metadata.
- `npm run release:artifacts` packages every extension and collects the generated `.vsix` files into `.artifacts/vsix/` for CI or manual release handling.

See `RELEASING.md` for the release packaging flow.
