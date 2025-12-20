# SonarCloud API Integration Guide

## Overview

This guide explains how to programmatically access SonarCloud scan results using the Web API and the provided utility script.

## Prerequisites

1. **SonarCloud Token** (Optional for public projects, required for private)
   - Go to https://sonarcloud.io/account/security
   - Generate a new token
   - Set as environment variable: `export SONAR_TOKEN=your_token_here`

2. **Project Details**
   - Organization: `ZinTrust_ZinTrust`
   - Project Key: `ZinTrust_ZinTrust`

## Quick Start

### Using npm scripts (recommended)

```bash
# Download all issues
npm run sonarcloud:issues

# Download only LOW severity OPEN/CONFIRMED issues
npm run sonarcloud:issues:low

# Download issues with quality measures
npm run sonarcloud:issues:measures
```

### Using the script directly

```bash
# All issues
tsx scripts/sonarcloud-issues.ts

# Filter by severity
tsx scripts/sonarcloud-issues.ts --low
tsx scripts/sonarcloud-issues.ts --medium
tsx scripts/sonarcloud-issues.ts --high

# Filter by status
tsx scripts/sonarcloud-issues.ts --open

# Include quality measures
tsx scripts/sonarcloud-issues.ts --measures

# Combine filters
tsx scripts/sonarcloud-issues.ts --low --open --measures
```

## Environment Variables

Set these in your `.env` file or export them:

```bash
export SONAR_TOKEN=your_token_here
export SONAR_ORGANIZATION=ZinTrust_ZinTrust
export SONAR_PROJECT_KEY=ZinTrust_ZinTrust
```

## Output Files

The script generates reports in the `reports/` directory:

- `sonarcloud-issues-{timestamp}.txt` - Human-readable report with code snippets
- `sonarcloud-issues-{timestamp}.json` - Raw JSON data
- `sonarcloud-measures-{timestamp}.json` - Quality metrics (with `--measures`)

## Features

- **Code Snippets**: Automatically reads local files to show the code context for each issue.
- **Impact Analysis**: Shows the software quality impact and severity.
- **Clean Code Attributes**: Displays the specific clean code attribute category.
- **Pagination**: Handles large result sets automatically.
- **Filtering**: Support for severity, status, and type filters.

## API Endpoints Used

### 1. Issues Search

```
GET https://sonarcloud.io/api/issues/search
```

**Parameters:**

- `componentKeys` - Project key
- `impactSeverities` - BLOCKER, CRITICAL, HIGH, MAJOR, MEDIUM, MINOR, LOW, INFO
- `issueStatuses` - OPEN, CONFIRMED, REOPENED, RESOLVED, CLOSED
- `types` - CODE_SMELL, BUG, VULNERABILITY, SECURITY_HOTSPOT
- `severities` - Legacy severity (still supported)
- `resolved` - true/false
- `p` - Page number
- `ps` - Page size (max 500)

**Example:**

```bash
curl -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?componentKeys=ZinTrust_ZinTrust&impactSeverities=LOW&issueStatuses=OPEN,CONFIRMED"
```

### 2. Project Measures

```
GET https://sonarcloud.io/api/measures/component
```

**Parameters:**

- `component` - Project key
- `metricKeys` - Comma-separated list of metrics

**Available Metrics:**

- `bugs` - Number of bugs
- `vulnerabilities` - Number of vulnerabilities
- `code_smells` - Number of code smells
- `coverage` - Test coverage percentage
- `duplicated_lines_density` - Duplicated code percentage
- `ncloc` - Lines of code
- `sqale_index` - Technical debt (minutes)
- `reliability_rating` - A-E rating for reliability
- `security_rating` - A-E rating for security
- `sqale_rating` - A-E rating for maintainability

**Example:**

```bash
curl -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/measures/component?component=ZinTrust_ZinTrust&metricKeys=bugs,vulnerabilities,code_smells,coverage"
```

### 3. Quality Gate Status

```
GET https://sonarcloud.io/api/qualitygates/project_status
```

**Parameters:**

- `projectKey` - Project key

**Example:**

```bash
curl -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/qualitygates/project_status?projectKey=ZinTrust_ZinTrust"
```

## Using the SonarCloudClient Class

You can also import and use the client programmatically:

```typescript
import { SonarCloudClient } from './scripts/sonarcloud-issues.ts';

const client = new SonarCloudClient(
  'ZinTrust_ZinTrust', // organization
  'ZinTrust_ZinTrust', // projectKey
  process.env.SONAR_TOKEN // token (optional)
);

// Fetch all issues
const issues = await client.fetchAllIssues({
  impactSeverities: 'LOW',
  issueStatuses: 'OPEN,CONFIRMED',
});

// Fetch quality measures
const measures = await client.fetchMeasures(['bugs', 'vulnerabilities', 'coverage']);

console.log(`Found ${issues.length} issues`);
console.log('Measures:', measures);
```

## VS Code Extension Integration

To integrate with a VS Code extension:

### 1. Create Extension Command

```typescript
// extension.ts
import * as vscode from 'vscode';
import { SonarCloudClient } from './sonarcloud-issues';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('zintrust.fetchSonarIssues', async () => {
    const token = await vscode.workspace.getConfiguration('zintrust').get<string>('sonarToken');

    const client = new SonarCloudClient('ZinTrust_ZinTrust', 'ZinTrust_ZinTrust', token);

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching SonarCloud issues...',
      },
      async (progress) => {
        const issues = await client.fetchAllIssues();

        // Show in output channel
        const output = vscode.window.createOutputChannel('SonarCloud');
        output.show();
        output.appendLine(`Found ${issues.length} issues`);

        for (const issue of issues) {
          output.appendLine(
            `[${issue.severity}] ${issue.component}:${issue.line || '?'} - ${issue.message}`
          );
        }
      }
    );
  });

  context.subscriptions.push(disposable);
}
```

### 2. Add to package.json

```json
{
  "contributes": {
    "commands": [
      {
        "command": "zintrust.fetchSonarIssues",
        "title": "Zintrust: Fetch SonarCloud Issues"
      }
    ],
    "configuration": {
      "title": "Zintrust",
      "properties": {
        "zintrust.sonarToken": {
          "type": "string",
          "default": "",
          "description": "SonarCloud API Token"
        }
      }
    }
  }
}
```

## GitHub Actions Integration

Create `.github/workflows/sonarcloud-check.yml`:

```yaml
name: SonarCloud Check

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  sonarcloud:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

      - name: Download Issues Report
        run: |
          export SONAR_TOKEN="${{ secrets.SONAR_TOKEN }}"
          npm run sonarcloud:issues

      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: sonarcloud-report
          path: reports/
```

## Advanced Filtering

### Get issues by file

```typescript
const issues = await client.fetchAllIssues({
  componentKeys: 'ZinTrust_ZinTrust:src/Server.ts',
});
```

### Get only security vulnerabilities

```typescript
const issues = await client.fetchAllIssues({
  types: 'VULNERABILITY,SECURITY_HOTSPOT',
  issueStatuses: 'OPEN,CONFIRMED',
});
```

### Get technical debt items

```typescript
const issues = await client.fetchAllIssues({
  types: 'CODE_SMELL',
  impactSeverities: 'HIGH,MEDIUM',
});
```

## Troubleshooting

### Authentication Error (401)

- Verify your token is valid: https://sonarcloud.io/account/security
- Check token permissions (needs "Execute Analysis" permission)
- For public projects, token may not be needed

### Rate Limiting

SonarCloud has rate limits:

- **Anonymous**: 10,000 requests/day
- **Authenticated**: 100,000 requests/day

The script handles pagination automatically but respect rate limits.

### Empty Results

- Verify project key is correct
- Check if project is public (private projects require token)
- Ensure there are scans/issues in the project

## Resources

- [SonarCloud Web API Documentation](https://sonarcloud.io/web_api)
- [SonarCloud Project Dashboard](https://sonarcloud.io/project/overview?id=ZinTrust_ZinTrust)
- [SonarCloud Issues](https://sonarcloud.io/project/issues?id=ZinTrust_ZinTrust)
- [API Explorer](https://sonarcloud.io/web_api/)

## Example Output

```
╔════════════════════════════════════════════════════════════════╗
║                SONARCLOUD ISSUES REPORT                        ║
║                2025-12-20T10:30:00.000Z                        ║
╚════════════════════════════════════════════════════════════════╝

Total Issues: 42

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUES BY TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CODE_SMELL: 35
BUG: 5
VULNERABILITY: 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ISSUES BY SEVERITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HIGH: 2
MEDIUM: 10
LOW: 30
```
