#!/usr/bin/env bash
# SonarCloud Quality Check
# Run this as a pre-push hook or CI check

set -e

echo "🔍 Running SonarCloud Quality Check..."
echo ""

# Set colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if SONAR_TOKEN is set
if [ -z "$SONAR_TOKEN" ]; then
  echo -e "${YELLOW}⚠️  SONAR_TOKEN not set. Using public access.${NC}"
  echo ""
fi

# Run tests with coverage
echo "📊 Running tests with coverage..."
npm run test:coverage || {
  echo -e "${RED}❌ Tests failed!${NC}"
  exit 1
}
echo -e "${GREEN}✅ Tests passed${NC}"
echo ""

# Run SonarCloud scan
echo "🔬 Running SonarCloud scan..."
npm run sonarqube || {
  echo -e "${RED}❌ SonarCloud scan failed!${NC}"
  exit 1
}
echo -e "${GREEN}✅ SonarCloud scan complete${NC}"
echo ""

# Wait a bit for SonarCloud to process results
echo "⏳ Waiting for SonarCloud to process results..."
sleep 10
echo ""

# Fetch current issues
echo "📥 Downloading issue report..."
npm run sonarcloud:issues > /dev/null 2>&1 || {
  echo -e "${YELLOW}⚠️  Could not fetch issues report${NC}"
}
echo ""

# Get latest report
LATEST_REPORT=$(ls -t reports/sonarcloud-issues-*.txt 2>/dev/null | head -n 1)

if [ -n "$LATEST_REPORT" ]; then
  echo "📋 Latest SonarCloud Report:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat "$LATEST_REPORT"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Check if there are any issues
  ISSUE_COUNT=$(grep "Total Issues:" "$LATEST_REPORT" | grep -o '[0-9]*' || echo "0")

  if [ "$ISSUE_COUNT" -eq 0 ]; then
    echo -e "${GREEN}🎉 No issues found! Code quality is excellent!${NC}"
    exit 0
  else
    echo -e "${YELLOW}⚠️  Found $ISSUE_COUNT issue(s). Please review.${NC}"

    # Check for blockers/critical
    if grep -q "BLOCKER\|CRITICAL" "$LATEST_REPORT"; then
      echo -e "${RED}❌ BLOCKER or CRITICAL issues found!${NC}"
      echo ""
      echo "Please fix critical issues before pushing."
      exit 1
    else
      echo -e "${GREEN}✅ No critical issues found. Safe to proceed.${NC}"
      exit 0
    fi
  fi
else
  echo -e "${YELLOW}⚠️  No report file found${NC}"
  exit 0
fi
