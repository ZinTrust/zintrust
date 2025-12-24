# Getting Started with Zintrust

Welcome to Zintrust, a production-grade TypeScript backend framework with proven architectural patterns and zero external dependencies.

## Quick Start (2 minutes)

```bash
# Install Zintrust CLI
npm install -g zintrust

# Create a new project
zin new my-app
cd my-app

# Start development
npm run dev
```

Your API is now running at `http://localhost:3000`

## What is Zintrust?

Zintrust is a **zero-dependency** backend framework built on:

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

- Node.js >= 18.0.0
- npm (recommended)

### From npm (Recommended)

```bash
npm install -g zintrust
zin new my-app
```

### From source

```bash
git clone https://github.com/ZinTrust/ZinTrust.git
cd ZinTrust
npm install
npm run build
```

## Create Your First API

### 1. Define a Model

```typescript
// app/Models/User.ts
import { Model } from '@orm/Model';

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
import { Application } from '@';
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
npm run dev
```

Test it:

```bash
# Get all users
curl http://localhost:3000/api/users

# Create a user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

## Next Steps

- 📖 [Models & ORM](./models.md) - Database patterns and relationships
- 🛣️ [Routing](./routing.md) - HTTP routing and middleware
- 🏗️ [Microservices](./microservices.md) - Build distributed systems
- ⚙️ [CLI Commands](./cli-reference.md) - Code generation and management
- 📝 [API Reference](./api-reference.md) - Complete API documentation

## Architecture Overview

Zintrust uses a proven layered architecture:

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
- 🐛 [Issue Tracker](https://github.com/ZinTrust/ZinTrust/issues)
- 🤝 [Contributing Guide](./contributing.md)

## License

MIT - See [LICENSE](../LICENSE) for details
