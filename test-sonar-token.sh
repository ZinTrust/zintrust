#!/bin/bash

# Test SonarCloud Token and Quality Gate API
# This script tests if your SONAR_TOKEN has the right permissions

source .env

echo "🔍 Testing SonarCloud Token..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract actual values from .env
SONAR_TOKEN=$(grep SONAR_TOKEN .env | cut -d'"' -f2)
SONAR_ORGANIZATION=$(grep SONAR_ORGANIZATION .env | cut -d'"' -f2)
SONAR_PROJECT_ID=$(grep SONAR_PROJECT_ID .env | cut -d'"' -f2)
SONAR_HOST_URL=$(grep SONAR_HOST_URL .env | cut -d'"' -f2)

echo "Token: ${SONAR_TOKEN:0:10}...${SONAR_TOKEN: -10}"
echo "Organization: $SONAR_ORGANIZATION"
echo "Project: $SONAR_PROJECT_ID"
echo "Host: $SONAR_HOST_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Organization access
echo "Test 1: Organization Access"
echo "Endpoint: $SONAR_HOST_URL/api/organizations/search?organizations=$SONAR_ORGANIZATION"
echo ""

RESPONSE=$(curl -s -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/organizations/search?organizations=$SONAR_ORGANIZATION" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

echo "HTTP Code: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Organization accessible"
  echo ""
else
  echo "❌ Failed to access organization (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 2: Project access
echo "Test 2: Project Access"
echo "Endpoint: $SONAR_HOST_URL/api/projects/search?organization=$SONAR_ORGANIZATION&projects=$SONAR_PROJECT_ID"
echo ""

RESPONSE=$(curl -s -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/projects/search?organization=$SONAR_ORGANIZATION&projects=$SONAR_PROJECT_ID" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

echo "HTTP Code: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Project accessible"
  echo ""
else
  echo "❌ Failed to access project (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 3: Quality Gate Status (this is what fails)
echo "Test 3: Quality Gate Status (THE CRITICAL TEST)"
echo "Endpoint: $SONAR_HOST_URL/api/qualitygates/project_status?projectKey=$SONAR_PROJECT_ID"
echo ""

RESPONSE=$(curl -s -u "$SONAR_TOKEN:" "$SONAR_HOST_URL/api/qualitygates/project_status?projectKey=$SONAR_PROJECT_ID" -w "\n%{http_code}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

echo "HTTP Code: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Quality Gate status accessible"
  echo "Response: $BODY"
  echo ""
elif [ "$HTTP_CODE" = "403" ]; then
  echo "❌ Permission Denied (403) - Token doesn't have permission to check quality gates"
  echo "This is why the workflow is failing!"
  echo ""
elif [ "$HTTP_CODE" = "401" ]; then
  echo "❌ Unauthorized (401) - Token is invalid or expired"
  echo ""
elif [ "$HTTP_CODE" = "404" ]; then
  echo "⚠️  Project Not Found (404) - Project might not exist or be public"
  echo ""
else
  echo "❌ Unexpected error (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  If Test 3 shows 403: You need a token with 'api' permission"
echo "  If Test 3 shows 401: Token is invalid/expired"
echo "  If Test 3 shows 200: Token is working correctly ✅"
echo ""
