#!/bin/sh

set -e

if npm ci "$@"; then
  exit 0
fi

echo "npm ci failed; retrying with --legacy-peer-deps for unpublished workspace peer ranges in CI" >&2

if npm ci --legacy-peer-deps "$@"; then
  exit 0
fi

echo "npm ci with --legacy-peer-deps failed; falling back to npm install to self-heal lock drift in CI" >&2

if npm install --legacy-peer-deps "$@" --no-audit --no-fund; then
  exit 0
fi

echo "npm install failed, possibly due to EINTEGRITY. Cleaning cache and retrying..." >&2
npm cache clean --force
npm install --legacy-peer-deps "$@" --no-audit --no-fund
