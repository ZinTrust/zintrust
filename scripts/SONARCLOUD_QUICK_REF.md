# SonarCloud API - Quick Reference

## 🚀 Quick Commands

```bash
# Download all issues
npm run sonarcloud:issues

# Download LOW severity issues (OPEN/CONFIRMED)
npm run sonarcloud:issues:low

# Download with quality measures
npm run sonarcloud:issues:measures

# Run full quality check (tests + scan + report)
npm run sonarcloud:check
```

## 🔑 Set Your Token

```bash
export SONAR_TOKEN=your_token_here
```

Get token: https://sonarcloud.io/account/security

## 📊 Key Endpoints

### 1. Search Issues

```
https://sonarcloud.io/api/issues/search
```

**Parameters:**

- `componentKeys` - Project key
- `impactSeverities` - LOW, MEDIUM, HIGH, CRITICAL, BLOCKER
- `issueStatuses` - OPEN, CONFIRMED, REOPENED, RESOLVED, CLOSED
- `types` - BUG, VULNERABILITY, CODE_SMELL, SECURITY_HOTSPOT
- `p` - Page number
- `ps` - Page size (max 500)

**Example:**

```bash
curl -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?componentKeys=ZinTrust_ZinTrust&impactSeverities=LOW"
```

### 2. Get Measures

```
https://sonarcloud.io/api/measures/component
```

**Parameters:**

- `component` - Project key
- `metricKeys` - Comma-separated metrics

**Example:**

```bash
curl -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/measures/component?component=ZinTrust_ZinTrust&metricKeys=bugs,coverage"
```

### 3. Quality Gate Status

```
https://sonarcloud.io/api/qualitygates/project_status
```

**Example:**

```bash
curl -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/qualitygates/project_status?projectKey=ZinTrust_ZinTrust"
```

## 📈 Common Metrics

| Metric Key                 | Description              |
| -------------------------- | ------------------------ |
| `bugs`                     | Number of bugs           |
| `vulnerabilities`          | Security vulnerabilities |
| `code_smells`              | Code quality issues      |
| `coverage`                 | Test coverage %          |
| `duplicated_lines_density` | Duplicated code %        |
| `ncloc`                    | Lines of code            |
| `sqale_index`              | Technical debt (minutes) |
| `reliability_rating`       | A-E rating               |
| `security_rating`          | A-E rating               |
| `sqale_rating`             | Maintainability A-E      |

## 🎯 Filter Examples

### Get all bugs

```bash
tsx scripts/sonarcloud-issues.ts --types=BUG
```

### Get high severity issues

```bash
tsx scripts/sonarcloud-issues.ts --high --open
```

### Get issues in specific file

```typescript
const issues = await client.fetchAllIssues({
  componentKeys: 'ZinTrust_ZinTrust:src/Server.ts',
});
```

## 📁 Output Files

Located in `reports/`:

- `sonarcloud-issues-{timestamp}.txt` - Human-readable with code snippets
- `sonarcloud-issues-{timestamp}.json` - Raw data
- `sonarcloud-measures-{timestamp}.json` - Metrics

## 🔗 Important Links

- **Dashboard**: https://sonarcloud.io/project/overview?id=ZinTrust_ZinTrust
- **Issues**: https://sonarcloud.io/project/issues?id=ZinTrust_ZinTrust
- **API Docs**: https://sonarcloud.io/web_api
- **Token**: https://sonarcloud.io/account/security

## 💻 Programmatic Use

```typescript
import { SonarCloudClient } from './scripts/sonarcloud-issues';

const client = new SonarCloudClient(
  'ZinTrust_ZinTrust',
  'ZinTrust_ZinTrust',
  process.env.SONAR_TOKEN
);

// Fetch issues
const issues = await client.fetchAllIssues({
  impactSeverities: 'HIGH,CRITICAL',
  issueStatuses: 'OPEN',
});

// Fetch measures
const measures = await client.fetchMeasures(['bugs', 'vulnerabilities', 'coverage']);
```

## 🛠️ Troubleshooting

| Issue            | Solution                            |
| ---------------- | ----------------------------------- |
| 401 Unauthorized | Check SONAR_TOKEN validity          |
| Empty results    | Verify project key and permissions  |
| Rate limit       | Wait or use token for higher limits |
| No data          | Wait for scan to complete (~10s)    |

## ⚡ Rate Limits

- Anonymous: 10,000 requests/day
- Authenticated: 100,000 requests/day

---

**Project:** ZinTrust Framework
**Organization:** ZinTrust_ZinTrust
**Current Status:** ✅ 0 Open Issues
