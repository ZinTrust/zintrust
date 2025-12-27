# Security Policy

## Supported Versions

We provide security updates for the following versions of Zintrust:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Zintrust seriously. If you believe you have found a security vulnerability, please **do not** report it via a public issue.

Instead, please follow these steps:

1. Email your findings to **security@zintrust.com**.
2. Include a detailed description of the vulnerability and steps to reproduce it.
3. Give us reasonable time to investigate and resolve the issue before making any information public.

We will acknowledge your report within 48 hours and provide a timeline for the fix.

## Security Best Practices for Contributors

- **SQL Injection**: Always use `QueryBuilder` or parameterized queries. Never concatenate strings for SQL.
- **XSS**: Sanitize all user-provided content before rendering or storing.
- **Authentication**: Use the built-in `Auth` middleware for protected routes.
- **Dependencies**: Keep dependencies up to date and avoid adding unnecessary external packages.

## Automated Security Scans (CI)

This repo runs a `Security Scan` GitHub Actions workflow that checks dependencies, secrets, and static analysis.

- CodeQL results are generated as SARIF artifacts (download from the workflow run).
- Publishing SARIF to GitHub Code Scanning requires GitHub Advanced Security to be enabled for the repository.

## Running Security Scans Locally

You can run a quick dependency audit locally and save the results to `reports/`:

```bash
# Save npm audit JSON to a file
npm audit --json > reports/dependency-audit-$(date +%F).json || true
```

To run the same checks as CI locally:

- Snyk: `npx snyk test` (requires `SNYK_TOKEN`)
- Trivy (fs): `trivy fs --severity CRITICAL,HIGH .`
- CodeQL: follow GitHub CodeQL local analysis docs

CI lessons:

- CI will run `npm audit`, `Snyk`, `Trivy`, CodeQL and static analysis; review their workflow logs when a scan fails and prioritize CVEs by severity.

Reports from the last run are available in the `reports/` directory in the repository (e.g., `reports/dependency-audit-2025-12-27.json`).
