# Zintrust Contributor & QA Guide

Welcome to the Zintrust contributor community! This guide outlines the standards and workflows required to maintain the high quality of the Zintrust framework.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Coding Standards](#coding-standards)
3. [QA Workflows](#qa-workflows)
4. [Microservice Requirements](#microservice-requirements)
5. [Security Guidelines](#security-guidelines)
6. [Performance Standards](#performance-standards)
7. [Testing Strategy](#testing-strategy)
8. [Documentation Standards](#documentation-standards)
9. [Contributor License Agreement (CLA)](#cla)
10. [Code of Conduct](#code-of-conduct)
11. [First Timers Guide](#first-timers)

---

## Environment Setup

To contribute to Zintrust, ensure you have the following installed:

- **Node.js**: >= 18.0.0
- **Docker**: Required for local SonarQube and database testing.
- **Git**: For version control.

### Initial Setup

```bash
git clone https://github.com/ZinTrust/zintrust.git
cd zintrust
npm install
npx husky init
```

---

## Coding Standards

### TypeScript Strictness

- **No `any`**: Use of `any` is strictly forbidden. Use `unknown` or specific interfaces.
- **Strict Mode**: `tsconfig.json` has `strict: true`. Do not disable it.
- **Path Aliases**: Always use aliases (e.g., `@orm/Model`) instead of relative paths.

### ESLint & Logger

- **No `console.log`**: Use the internal `Logger` system ([src/config/logger.ts](src/config/logger.ts)).
- **Catch Blocks**: Every `catch` block **must** include a `Logger.error(error)` call.
- **Automated Fixes**: Run `zin fix` to automatically resolve common linting issues.

---

## QA Workflows

### Automated Hooks

- **Pre-commit**: Runs `eslint` and `type-check` on staged files.
- **Post-merge**: Triggers a background SonarQube scan if `SONAR_AUTO_SCAN=true` in your `.env`.

### Unified QA Command

Run the full QA suite before submitting a PR:

```bash
zin qa
```

This command generates a dashboard at `coverage/qa-report.html` aggregating results from:

- ESLint
- TypeScript Compiler
- Vitest (Coverage must be > 90%)
- SonarQube (Quality Gate must pass)

---

## Microservice Requirements

When contributing to or creating a microservice:

1. **Health Check**: Must expose `GET /health`.
2. **Tracing**: Must propagate `x-trace-id` headers.
3. **Isolation**: Ensure the service can run independently via Docker.
4. **Config**: Must include a valid `service.config.json`.

---

## Security Guidelines

### SQL Injection Prevention

- **NEVER** use raw string concatenation for SQL queries.
- **ALWAYS** use the `QueryBuilder` ([src/orm/QueryBuilder.ts](src/orm/QueryBuilder.ts)) or parameterized queries.
- **Validation**: All user input must be validated using the `Validator` utilities before reaching the database layer.

### Vulnerability Reporting

If you find a security vulnerability, please do **not** open a public issue. Email security@zintrust.com instead.

---

## Performance Standards

### N+1 Query Detection

- Check `logs/app/n1-detector.log` during development.
- Use eager loading (`with()`) for relationships to minimize database roundtrips.

### Caching

- Implement caching for expensive operations using the `Cache` utility.
- Ensure cache keys are unique and properly namespaced.

---

## Testing Strategy

- **Unit Tests**: For core logic and utilities.
- **Integration Tests**: For database and service interactions.
- **E2E Tests**: For critical API workflows.
- **Factories**: Use `zin add factory <name>` to generate test data.

---

## Documentation Standards

- **JSDoc**: All public APIs must have JSDoc comments.
- **Markdown**: New features must include an updated `.md` file in the `docs/` directory.
- **Website**: Ensure changes are reflected in the `docs-website/` by running `npm run dbl`.

---

## Contributor License Agreement (CLA)

By contributing to Zintrust, you agree to the following:

1. You grant Zintrust a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contributions.
2. You represent that you are legally entitled to grant this license.

---

## Code of Conduct

We are committed to providing a welcoming and inspiring community.

- **Be Respectful**: Treat others with respect and kindness.
- **Be Inclusive**: Encourage diversity and different perspectives.
- **Zero Tolerance**: Harassment and exclusionary behavior will not be tolerated.

---

## First Timers Guide

New to Zintrust? Look for issues labeled `good-first-issue` or `first-timer`.

1. **Fork** the repository.
2. **Create a branch** (`feat/your-feature`).
3. **Implement** your changes following this guide.
4. **Run `zin qa`** to ensure everything is perfect.
5. **Submit a PR** with a clear description of your changes.

Happy coding!
