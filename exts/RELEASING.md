# ZinTrust VS Code Extensions Release

## Local Release Prep

Run the extension workspace release pack locally from the repository root:

```bash
npm --prefix exts ci
npm --prefix exts run release:artifacts
```

This flow will:

- compile every extension workspace,
- run the shared command-surface and focused behavior tests,
- package each workspace with `vsce`, and
- collect the resulting `.vsix` files into `exts/.artifacts/vsix/`.

## Marketplace Metadata

Each extension manifest under `exts/zintrust-*/package.json` is expected to keep:

- `publisher: zintrust`
- repository metadata pointing to `https://github.com/ZinTrust/zintrust.git`
- a package-local homepage and bugs URL
- `README.md`, `LICENSE.md`, and compiled output in the shipped `files` whitelist

The release validation script checks these fields before artifacts are collected.

## GitHub Actions

The repository workflow at `.github/workflows/exts-release.yml` packages the extension workspace on manual dispatch or an `exts-v*` tag push and uploads the `.vsix` files as build artifacts.

If you later want Marketplace publishing in CI, store the publisher token as `VSCE_PAT` and layer a publish step on top of the packaged artifacts after the versions have been bumped intentionally.
