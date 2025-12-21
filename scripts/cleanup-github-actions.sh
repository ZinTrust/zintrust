#!/bin/bash

###############################################################################
# GitHub Actions Cleanup Script
# Deletes all workflow runs except the last 2 for each workflow
# Usage: ./scripts/cleanup-github-actions.sh
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_OWNER="ZinTrust"
REPO_NAME="zintrust"
REPO="$REPO_OWNER/$REPO_NAME"
KEEP_LAST=2

# Banner
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          GitHub Actions Cleanup Script                     ║${NC}"
echo -e "${BLUE}║   Keeps last $KEEP_LAST runs per workflow, deletes the rest      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is not installed${NC}"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ Not authenticated with GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✅ GitHub CLI authenticated${NC}"
echo ""

# Function to cleanup workflow
cleanup_workflow() {
    local workflow=$1
    echo -e "${YELLOW}Processing workflow: $workflow${NC}"

    # Get list of runs, skip first KEEP_LAST runs, extract database IDs
    local runs=$(gh run list --repo "$REPO" --workflow "$workflow" --json databaseId -q ".[${KEEP_LAST}:] | .[].databaseId" 2>/dev/null || true)

    if [ -z "$runs" ]; then
        echo -e "${GREEN}  ℹ️  Less than $((KEEP_LAST + 1)) runs found, nothing to delete${NC}"
        return
    fi

    local count=$(echo "$runs" | wc -l)
    echo -e "${YELLOW}  📊 Found $count runs to delete${NC}"

    # Delete each run
    local deleted=0
    while IFS= read -r run_id; do
        if [ -n "$run_id" ]; then
            echo "  🗑️  Deleting run #$run_id..."
            gh run delete "$run_id" --repo "$REPO" || echo "    ⚠️  Failed to delete run $run_id"
            ((deleted++))
        fi
    done <<< "$runs"

    echo -e "${GREEN}  ✅ Deleted $deleted runs${NC}"
    echo ""
}

# Array of workflows to process
WORKFLOWS=(
    "ci.yml"
    "sonarqube.yml"
    "security.yml"
    "docker-publish.yml"
)

echo -e "${BLUE}Starting cleanup for repository: $REPO${NC}"
echo ""

# Process each workflow
for workflow in "${WORKFLOWS[@]}"; do
    cleanup_workflow "$workflow"
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}✅ Cleanup completed!${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Summary:"
echo "  Repository: $REPO"
echo "  Kept: Last $KEEP_LAST runs per workflow"
echo "  Deleted: All older runs"
echo ""
echo "View remaining runs:"
echo "  gh run list --repo $REPO"
echo ""
