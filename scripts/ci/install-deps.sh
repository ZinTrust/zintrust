#!/bin/sh

set -eu

if npm ci "$@"; then
  exit 0
fi

echo "npm ci failed; falling back to npm install to self-heal lock drift in CI" >&2

npm install "$@" --no-audit --no-fund
