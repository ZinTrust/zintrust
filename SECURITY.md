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
