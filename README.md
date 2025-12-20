# Zintrust Framework

[![Website](https://img.shields.io/badge/website-zintrust.com-blue)](https://zintrust.com)
[![CI/CD Pipeline](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml)
[![SonarQube Analysis](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml)
[![Security Scan](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/ZinTrust/ZinTrust/badge.svg)](https://snyk.io/test/github/ZinTrust/ZinTrust)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/zintrust.svg)](https://www.npmjs.com/package/zintrust)

Production-grade TypeScript backend framework with zero external dependencies for core logic. Visit [zintrust.com](https://zintrust.com) for more information.

## Status

| Check        | Status                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build**    | [![CI/CD Pipeline](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/ci.yml)                                                                                                                                                                                                         |
| **Quality**  | [![SonarQube Analysis](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/sonarqube.yml) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ZinTrust_ZinTrust&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=ZinTrust_ZinTrust) |
| **Security** | [![Security Scan](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml/badge.svg)](https://github.com/ZinTrust/ZinTrust/actions/workflows/security.yml) [![Known Vulnerabilities](https://snyk.io/test/github/ZinTrust/ZinTrust/badge.svg)](https://snyk.io/test/github/ZinTrust/ZinTrust)                                                           |
| **Tests**    | ![Tests Passing](https://img.shields.io/badge/tests-passing-brightgreen)                                                                                                                                                                                                                                                                                            |
| **Coverage** | ![Coverage](https://img.shields.io/badge/coverage-90%2B%25-brightgreen)                                                                                                                                                                                                                                                                                             |

## Features

✅ **Type-Safe ORM & Query Builder** – No raw SQL, chainable queries
✅ **Multi-Database Support** – SQLite (primary), PostgreSQL, MySQL, SQL Server ready
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
# Install dependencies
npm install

# Start development server
npm run dev

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
├── routes/                 # Route definitions
├── src/                    # Framework & services
│   ├── config/             # Centralized configuration (env, app, database, security, etc.)
│   ├── database/           # Migrations, seeders, factories
│   ├── functions/          # Serverless handlers (Lambda, Deno, Cloudflare)
│   ├── services/           # Microservices (ecommerce domain)
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
└── md/                     # Internal documentation
```

## Documentation

See [docs/](docs/) for comprehensive guides on:

- [Getting Started](docs/getting-started.md)
- [Models & ORM](docs/models.md)
- [Query Builder](docs/query-builder.md)
- [Routing](docs/routing.md)
- [Middleware](docs/middleware.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)

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
- **Zero-dependency core**: Framework logic uses only Node.js built-ins

## Development

```bash
# Watch mode with hot reload
npm run watch

# Format code
npm run format

# Lint code
npm run lint

# Type checking
npm run type-check

# Run tests with coverage
npm run test:coverage

# SonarQube analysis
npm run sonarqube
```

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
- **LinkedIn**: [ZinTrust](https://linkedin.com/company/zintrust)
- **YouTube**: [@zintrust](https://youtube.com/@zintrust)

## License

MIT

---

**Copyright © 2025 Zintrust Framework. All rights reserved.**
