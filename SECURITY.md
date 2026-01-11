# Security Policy

## Supported Versions

We provide security updates for the following versions of ZinTrust:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of ZinTrust seriously. If you believe you have found a security vulnerability, please **do not** report it via a public issue.

Instead, please follow these steps:

1. Email your findings to **security@zintrust.com**.
2. Include a detailed description of the vulnerability and steps to reproduce it.
3. Give us reasonable time to investigate and resolve the issue before making any information public.

We will acknowledge your report within 48 hours and provide a timeline for the fix.

## Security Best Practices for Contributors

ZinTrust follows a defense-in-depth approach with **10 independent security layers**; see [docs/security.md](docs/security.md) for the full architecture and recommended usage patterns.

### Defense-in-Depth Architecture

ZinTrust implements a **10-layer security architecture** where attackers must breach multiple independent security controls:

| Layer  | Control                  | Location          | Purpose                                                   |
| ------ | ------------------------ | ----------------- | --------------------------------------------------------- |
| **1**  | Security Headers         | Global Middleware | HSTS, CSP, X-Frame-Options, X-Content-Type-Options        |
| **2**  | CORS                     | Global Middleware | Origin validation, preflight handling                     |
| **3**  | Rate Limiting            | Global Middleware | 100 req/min baseline (configurable per-route)             |
| **4**  | CSRF Protection          | Global Middleware | Double Submit Cookie pattern                              |
| **5**  | XSS Sanitization         | Global Middleware | Recursive HTML stripping via `Xss.sanitize`               |
| **6**  | Field Sanitization       | Route Middleware  | Type-specific input normalization via `Sanitizer.*`       |
| **7**  | Schema Validation        | Route Middleware  | Type checking, format validation via `Validator.validate` |
| **8**  | Authentication           | Route Middleware  | JWT verification, session validation                      |
| **9**  | Authorization            | Controller Logic  | Role-based access control, ownership checks               |
| **10** | SQL Injection Prevention | Database Layer    | Prepared statements via QueryBuilder                      |

### Key Security Practices

- **SQL Injection**: Always use `QueryBuilder` or parameterized queries. Never concatenate strings for SQL.
- **XSS**: Sanitize all user-provided content before rendering or storing. Use `Xss.sanitize` and field-specific `Sanitizer.*` methods.
- **Authentication**: Use the built-in `Auth` middleware (`['auth', 'jwt']`) for protected routes.
- **Input Validation**: Always use validation middleware with field sanitizers before processing user input.
- **Dependencies**: Keep dependencies up to date and avoid adding unnecessary external packages.
- **Security Logging**: Log all authentication failures, authorization denials, and suspicious activity for audit trails.

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
