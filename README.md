# Zintrust Framework

[![Website](https://img.shields.io/badge/website-zintrust.com-blue)](https://zintrust.com)
[![CI/CD Pipeline](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml)
[![SonarQube Analysis](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml)
[![SonarCloud Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=ZinTrust_ZinTrust&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=ZinTrust_ZinTrust&metric=coverage)](https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=ZinTrust_ZinTrust&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=ZinTrust_ZinTrust&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust)
[![Security Scan](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/ZinTrust/ZinTrust/badge.svg)](https://snyk.io/test/github/ZinTrust/ZinTrust)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@zintrust/core.svg)](https://www.npmjs.com/package/@zintrust/core)

Production-grade TypeScript backend framework with a “minimal core” (no Express/Fastify) and a batteries-included CLI + developer experience. Visit [zintrust.com](https://zintrust.com) for more information.

## Status

| Check        | Status                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Build**    | [![CI/CD Pipeline](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml)                                                                                                                                                                                      |
| **Quality**  | [![SonarQube Analysis](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml)                                                                                                                                                                    |
| **Security** | [![Security Scan](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml) [![Known Vulnerabilities](https://snyk.io/test/github/ZinTrust/ZinTrust/badge.svg)](https://snyk.io/test/github/ZinTrust/ZinTrust)                                        |
| **Docker**   | [![Publish Docker Image](https://github.com/ZinTrust/ZinTrust/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/docker-publish.yml) [![Docker Image](https://img.shields.io/badge/image-ghcr.io%2FZinTrust%2FZinTrust-blue)](https://github.com/ZinTrust/ZinTrust/pkgs/container/zintrust) |
| **Tests**    | ![Tests Passing](https://img.shields.io/badge/tests-passing-brightgreen)                                                                                                                                                                                                                                                                         |

### SonarCloud

- Quality Gate + key measures: [https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust](https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust)

If you want PR-specific “New Code” numbers in GitHub, rely on the SonarCloud PR Check (that’s where `pullRequest=...` links come from); the README badges above intentionally track the project overview so they stay stable.

## Features

✅ **Type-Safe ORM & Query Builder** – No raw SQL, chainable queries
✅ **Multi-Database Support** – SQLite, PostgreSQL, MySQL, SQL Server via adapters
✅ **Declarative Routing** – Groups, resources, nested routes
✅ **Service Container** – Dependency injection out of the box
✅ **Migrations & Seeding** – Schema versioning, factory-based test data
✅ **N+1 Detection** – Built-in query optimization monitoring
✅ **Memory Profiling** – Heap/GC tracking per request
✅ **SQL Injection Prevention** – Parameterized queries by default
✅ **Multi-Cloud Ready** – Docker, AWS, Cloudflare Wrangler, Deno
✅ **Production Quality** – SonarQube integration, 90%+ test coverage

## Quick Start

```bash
# Install @zintrust/core (Zintrust CLI) globally
npm install -g @zintrust/core

# Create a new project
zin new my-app
cd my-app

# Install adapters as needed (example: SQLite)
zin add db:sqlite

# Start development server
zin start
```

New projects include an `.env` with safe defaults (and the generator will backfill them if missing):

- `HOST=localhost`
- `PORT=7777`
- `LOG_LEVEL=debug`

## Adapters (on-demand installs)

Zintrust ships a minimal core. Database/cache/etc. integrations are installed explicitly via adapter packages.

```bash
# Database adapters
zin add db:sqlite    # installs @zintrust/db-sqlite
zin add db:postgres  # installs @zintrust/db-postgres
zin add db:mysql     # installs @zintrust/db-mysql
zin add db:mssql     # installs @zintrust/db-sqlserver
```

The canonical CLI is `zin`. `z` is a documented shorthand alias.

## Core Package Dependencies (CLI + DX)

The npm package `@zintrust/core` includes a small set of runtime dependencies primarily to power the CLI and developer experience.

- `commander` - command parsing and `--help` UX for the `zin` CLI
- `inquirer` - interactive prompts (project scaffolding, generators)
- `chalk` - terminal colors for readable CLI output
- `tsx` - runs TypeScript-based CLI entrypoints without requiring a separate build step during development

Some dependencies are used by built-in features/adapters:

- `bcrypt` - password hashing helpers
- `jsonwebtoken` - JWT token signing/verification utilities

Database drivers are provided by adapter packages (for example, `@zintrust/db-sqlite` depends on `better-sqlite3`).
Note: native modules like `better-sqlite3` may require build tools on certain platforms.

## Development

If you want to contribute to the framework:

```bash
# Clone the repository
git clone https://github.com/ZinTrust/ZinTrust.git
cd ZinTrust

# Install dependencies
npm install

# Start development server
zin start

# Run tests
npm test

# Build for production
npm run build
```

## Project Structure

```
zintrust/
├── app/                    # Application code (Controllers, Models, Middleware)
├── bin/                    # CLI tools and commands
├── packages/                # Optional adapter packages (cache/db/mail/queue/storage)
├── routes/                 # Route definitions
├── services/                # Example microservices (ecommerce)
├── src/                    # Framework & services
│   ├── config/             # Centralized configuration (env, app, database, security, etc.)
│   ├── database/           # Migrations, seeders, factories
│   ├── functions/          # Serverless handlers (Lambda, Deno, Cloudflare)
│   ├── orm/                # Object-Relational Mapping
│   ├── routing/            # Routing engine
│   ├── middleware/         # Middleware system
│   ├── container/          # Service container (DI)
│   ├── http/               # Request/Response handlers
│   ├── microservices/      # Microservices framework
│   ├── security/           # Security utilities
│   ├── validation/         # Input validation
│   ├── profiling/          # Performance profiling
│   └── deployment/         # Cloud adapters (AWS, Cloudflare, Deno)
├── tests/                  # Test files
│   ├── unit/               # Unit tests
│   └── integration/        # Integration tests
├── docs/                   # Public documentation
├── docs-website/            # Docs site build output/tools
└── md/                     # Internal documentation
```

## Documentation

See [docs/](docs/) for comprehensive guides on:

- [Getting Started](docs/getting-started.md)
- [Models & ORM](docs/models.md)
- [Advanced ORM Relationships](docs/orm-advanced-relationships.md)
- [Query Builder](docs/query-builder.md)
- [Routing](docs/routing.md)
- [Middleware](docs/middleware.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)

Practical walkthroughs:

- [CLI Guide](docs/cli-guide.md)
- [CLI Reference](docs/cli-reference.md)
- [Tasks Demo (A–Z)](docs/tasks-demo.md)

## Import Patterns

Use path aliases for clean, maintainable imports:

```typescript
// Configuration
import { appConfig } from '@config/app';
import { databaseConfig } from '@config/database';
import { securityConfig } from '@config/security';

// ORM & Database
import { Model } from '@orm/Model';
import { Database } from '@orm/Database';

// Routing
import { Router } from '@routing/Router';

// HTTP
import { Request } from '@http/Request';
import { Response } from '@http/Response';

// Services & Microservices
import { MicroserviceBootstrap } from '@microservices/MicroserviceBootstrap';

// Application code (app folder)
import { User } from '@app/Models/User';
import { UserController } from '@app/Controllers/UserController';

// Serverless
import { handler } from '@functions/lambda';

// Microservices
import { usersService } from '@services/ecommerce/users';
```

## Architecture

Zintrust is built on proven architectural patterns for modern backend development:

- **Models first**: Define your data schema with explicit models
- **Type safety**: Full TypeScript with strict mode enabled
- **Testing focus**: Vitest integration with fast, isolated tests
- **Performance by default**: N+1 detection, memory profiling built-in
- **Minimal core**: Core HTTP/routing logic avoids external web frameworks; the published package still includes CLI/DX dependencies listed above

## Contributing

We welcome contributions! Please see our **[Contributor & QA Guide](docs/contributing.md)** for details on our code of conduct, and the process for submitting pull requests.

### Quality Assurance

Zintrust enforces strict quality standards. Before submitting a PR, ensure you run:

```bash
zin qa
```

This will run linting, type-checking, and tests to ensure your changes meet our standards.

## Security

If you discover a security vulnerability within Zintrust, please see our [Security Policy](SECURITY.md).

## Community & Support

Join our community and stay updated:

- **Website**: [zintrust.com](https://zintrust.com)
- **X (Twitter)**: [@zintrust](https://x.com/zintrust)
- **Discord**: [Join our server](https://discord.gg/zintrust)
- **Slack**: [Join our workspace](https://slack.zintrust.com)
- **Reddit**: [r/zintrust](https://reddit.com/r/zintrust)
- **Dev.to**: [zintrust](https://dev.to/zintrust)
- **Medium**: [@zintrust](https://medium.com/@zintrust)
- **Stack Overflow**: [zintrust](https://stackoverflow.com/users/32073668/zintrust)
- **LinkedIn**: [ZinTrust](https://linkedin.com/company/zintrustjs)
- **YouTube**: [@zintrust](https://youtube.com/@zintrust)

## License

MIT

---

**Copyright © 2025 Zintrust Framework. All rights reserved.**
