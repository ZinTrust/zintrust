#!/bin/sh

# Enforce patch coverage before pushing.
# - Computes the diff base as the merge-base with your upstream branch when available.
# - Runs full coverage, then checks changed executable lines coverage.

set -e

MIN_PCT=${MIN_PCT:-82}
COVERAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/zintrust-coverage-patch.XXXXXX")

cleanup() {
  rm -rf "$COVERAGE_DIR"
}

trap cleanup EXIT INT TERM

UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)

if [ -n "$UPSTREAM" ]; then
  BASE=$(git merge-base HEAD "$UPSTREAM")
else
  if git show-ref --verify --quiet refs/remotes/origin/master; then
    BASE=$(git merge-base HEAD origin/master)
  else
    BASE=$(git merge-base HEAD master)
  fi
fi

echo "Patch coverage base: $BASE"
echo "Patch coverage reports directory: $COVERAGE_DIR"

ZINTRUST_COVERAGE_REPORTS_DIR="$COVERAGE_DIR" npm run -s test:coverage
# TODO: Re-enable --fail-on-uncovered after adding tests for schema/migration files
ZINTRUST_COVERAGE_REPORTS_DIR="$COVERAGE_DIR" npx --no-install tsx scripts/coverage-diff.ts "$BASE" HEAD --treat-missing-as-uncovered --min-pct=$MIN_PCT
