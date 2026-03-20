# ZinTrust Contributor & QA Guide

Welcome to the ZinTrust contributor community! This guide outlines the standards and workflows required to maintain the high quality of the ZinTrust framework.

## Table of Contents

- [ZinTrust Contributor \& QA Guide](#zintrust-contributor--qa-guide)
  - [Table of Contents](#table-of-contents)
  - [Environment Setup](#environment-setup)
    - [Initial Setup](#initial-setup)
  - [Coding Standards](#coding-standards)
    - [TypeScript Strictness](#typescript-strictness)
    - [ESLint \& Logger](#eslint--logger)
  - [QA Workflows](#qa-workflows)
    - [Automated Hooks](#automated-hooks)
    - [Unified QA Command](#unified-qa-command)
  - [Microservice Requirements](#microservice-requirements)
  - [Security Guidelines](#security-guidelines)
    - [SQL Injection Prevention](#sql-injection-prevention)
    - [Vulnerability Reporting](#vulnerability-reporting)
  - [Performance Standards](#performance-standards)
    - [N+1 Query Detection](#n1-query-detection)
    - [Caching](#caching)
  - [Testing Strategy](#testing-strategy)
  - [Optional CLI Packages](#optional-cli-packages)
    - [Required pattern](#required-pattern)
    - [Rules](#rules)
    - [Examples](#examples)
  - [Documentation Standards](#documentation-standards)
  - [Contributor License Agreement (CLA)](#contributor-license-agreement-cla)
  - [Code of Conduct](#code-of-conduct)
  - [First Timers Guide](#first-timers-guide)

---

## Environment Setup

To contribute to ZinTrust, ensure you have the following installed:

- **Node.js**: >= 20.0.0
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

- **No `Logger.info` bypass**: Use the `Logger` system ([src/config/logger.ts](src/config/logger.ts)).
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

## Optional CLI Packages

Optional CLI commands must be implemented as install-only extensions, not as static imports in core.

### Required pattern

1. Add a `./register` export in the package `package.json`.
2. Create a `src/register.ts` side-effect entrypoint that registers command providers into [src/cli/OptionalCliCommandRegistry.ts](src/cli/OptionalCliCommandRegistry.ts).
3. Add the package metadata to [src/cli/OptionalCliExtensions.ts](src/cli/OptionalCliExtensions.ts): package name, `./register` specifier, command names, install command, and monorepo-only local fallback paths.
4. Resolve the package from the developer project root first. This is required because `@zintrust/core` may be installed globally while the optional package is installed locally in the project.
5. Add tests for both cases:
   - command becomes visible when the package is installed
   - CLI returns a clear install message when the package is missing

### Rules

- Do not statically import optional packages in [src/cli/CLI.ts](src/cli/CLI.ts).
- Do not rely on `packages/...` runtime paths outside monorepo development fallback logic.
- Keep the `./register` file side-effect safe and focused on command registration only.
- If the package needs core command builders, export them through the public `@zintrust/core/cli` API rather than importing internal files.

### Examples

- D1 migrator: [packages/d1-migrator/src/register.ts](packages/d1-migrator/src/register.ts)
- Workers package: [packages/workers/src/register.ts](packages/workers/src/register.ts)
- Core registry: [src/cli/OptionalCliCommandRegistry.ts](src/cli/OptionalCliCommandRegistry.ts)
- Core loader: [src/cli/OptionalCliExtensions.ts](src/cli/OptionalCliExtensions.ts)

---

## Documentation Standards

- **JSDoc**: All public APIs must have JSDoc comments.
- **Markdown**: New features must include an updated `.md` file in the `docs/` directory.
- **Website**: Ensure changes are reflected in the `docs-website/` by running `npm run dbl`.

---

## Contributor License Agreement (CLA)

By contributing to ZinTrust, you agree to the following:

1. You grant ZinTrust a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contributions.
2. You represent that you are legally entitled to grant this license.

---

## Code of Conduct

We are committed to providing a welcoming and inspiring community.

- **Be Respectful**: Treat others with respect and kindness.
- **Be Inclusive**: Encourage diversity and different perspectives.
- **Zero Tolerance**: Harassment and exclusionary behavior will not be tolerated.

---

## First Timers Guide

New to ZinTrust? Look for issues labeled `good-first-issue` or `first-timer`.

1. **Fork** the repository.
2. **Create a branch** (`feat/your-feature`).
3. **Implement** your changes following this guide.
4. **Run `zin qa`** to ensure everything is perfect.
5. **Submit a PR** with a clear description of your changes.

Happy coding!
