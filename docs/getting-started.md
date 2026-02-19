# Getting Started with ZinTrust

Welcome to ZinTrust, a production-grade TypeScript backend framework with proven architectural patterns and a minimal core (no Express/Fastify). The published npm package also includes a few runtime dependencies for the CLI and developer experience.

## Quick Start (2 minutes)

```bash
# Install @zintrust/core (ZinTrust CLI)
npm install -g @zintrust/core

# Create a new project
zin new my-app
cd my-app

# Install adapters as needed (example: SQLite)
zin add db:sqlite

# Start development
zin start
```

Your API is now running at `http://localhost:7777`

If you’re targeting a different runtime:

- Cloudflare Workers (Wrangler): `zin start --wg`
- Cloudflare Containers proxy (Wrangler + Docker): `zin init:containers-proxy` then `zin docker -e staging`
- AWS Lambda adapter mode: `zin start --lambda`
- Deno adapter mode: `zin start --deno`

The canonical CLI is `zin`. `z` is a shorthand alias.

## Install adapters (database/cache/etc.)

ZinTrust keeps the core package minimal. Integrations like database drivers are installed explicitly via adapter packages.

```bash
# Database adapters
zin add db:sqlite    # @zintrust/db-sqlite
zin add db:postgres  # @zintrust/db-postgres
zin add db:mysql     # @zintrust/db-mysql
zin add db:mssql     # @zintrust/db-sqlserver
```

## What is ZinTrust?

ZinTrust is a **minimal-core** backend framework built on:

- ✅ **Pure Node.js** - No Express, Fastify, or external HTTP libraries
- ✅ **Type-Safe** - Strict TypeScript with 100% type coverage
- ✅ **Microservices** - Built-in service discovery and orchestration
- ✅ **Production Ready** - Used in high-traffic applications

## Key Features

### 🚀 Blazing Fast

- Native HTTP server - No framework overhead
- Type-safe queries with automatic SQL injection prevention
- Efficient memory management with built-in profiling

### 🛡️ Secure by Default

- No raw SQL - QueryBuilder enforces parameterized queries
- Automatic CSRF protection
- JWT token management
- XSS vulnerability prevention

### 📊 Observable

- Built-in N+1 query detection
- Memory profiling per request
- Request tracing across microservices
- File-based logging system

### 🔧 Developer Friendly

- Modern Active Record ORM
- Fluent routing API with middleware
- CLI scaffolding (models, migrations, controllers)
- Comprehensive testing utilities

## Installation

### Prerequisites

- Node.js >= 20.0.0
- Any npm-compatible package manager (npm, yarn, pnpm, bun)

### From npm (Recommended)

ZinTrust is distributed on npm as `@zintrust/core`.

```bash
npm install -g @zintrust/core
zin new my-app
```

You can install it with any npm-compatible package manager:

```bash
# npm
npm install -g @zintrust/core

# yarn
yarn global add @zintrust/core

# pnpm
pnpm add -g @zintrust/core

# bun
bun add -g @zintrust/core
```

### From source

```bash
git clone https://github.com/ZinTrust /ZinTrust .git
cd ZinTrust
npm install
npm run build
```

## Create Your First API

### 1. Define a Model

```typescript
// app/Models/User.ts
import { Model } from '@zintrust/core';

export const User = Model.define({
  table: 'users',
  fillable: ['name', 'email', 'password'],
  hidden: ['password'],
  timestamps: true,
  casts: {
    is_admin: 'boolean',
  },
});
```

### 2. Create a Route

```typescript
// routes/api.ts
import { Application } from '@zintrust/core';
import { User } from '@app/Models/User';

export function registerRoutes(app: Application): void {
  const router = app.getRouter();

  // Get all users
  router.get('/api/users', async (req, res) => {
    const users = await User.all();
    res.json({ data: users });
  });

  // Get user by ID
  router.get('/api/users/:id', async (req, res) => {
    const user = await User.find(req.getParam('id'));
    if (!user) {
      return res.setStatus(404).json({ error: 'User not found' });
    }
    res.json({ data: user });
  });

  // Create user
  router.post('/api/users', async (req, res) => {
    const user = await User.create(req.getBody());
    res.setStatus(201).json({ data: user });
  });
}
```

### 3. Run Your API

```bash
zin start
```

Test it:

```bash
# Get all users
curl http://localhost:7777/api/users

# Create a user
curl -X POST http://localhost:7777/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

## Next Steps

- 📖 [Models & ORM](https://zintrust.com/doc/models) - Database patterns and relationships
- 🛣️ [Routing](https://zintrust.com/doc/routing) - HTTP routing and middleware
- 🏗️ [Microservices](https://zintrust.com/doc/microservices) - Build distributed systems
- ⚙️ [CLI Commands](https://zintrust.com/doc/cli-reference) - Code generation and management
- 📝 [API Reference](https://zintrust.com/doc/api-reference) - Complete API documentation

## Architecture Overview

ZinTrust uses a proven layered architecture:

```
┌─────────────────────────────────┐
│      HTTP Request/Response      │
├─────────────────────────────────┤
│      Router (URL Matching)      │
├─────────────────────────────────┤
│    Middleware Pipeline          │
├─────────────────────────────────┤
│    Controllers/Handlers         │
├─────────────────────────────────┤
│    Service Layer                │
├─────────────────────────────────┤
│    ORM Models                   │
├─────────────────────────────────┤
│    QueryBuilder (Type-Safe SQL) │
├─────────────────────────────────┤
│    Database Adapter             │
├─────────────────────────────────┤
│    Native Database Driver       │
└─────────────────────────────────┘
```

## Community & Support

- 📚 [Documentation](https://zintrust.com)
- 💬 [Discord Community](https://discord.gg/zintrust)
- 🐦 [Follow on X](https://x.com/zintrust)
- 🐛 [Issue Tracker](https://github.com/ZinTrust /ZinTrust /issues)
- 🤝 [Contributing Guide](./contributing.md)

## License

MIT - See [LICENSE](../LICENSE) for details
