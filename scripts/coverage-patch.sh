#!/bin/sh

# Enforce patch coverage before pushing.
# - Computes the diff base as the merge-base with your upstream branch when available.
# - Runs full coverage, then checks changed executable lines coverage.

set -e

MIN_PCT=${MIN_PCT:-82}

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

npm run -s test:coverage
# TODO: Re-enable --fail-on-uncovered after adding tests for schema/migration files
npm run -s coverage:diff -- "$BASE" HEAD --treat-missing-as-uncovered --min-pct=$MIN_PCT
