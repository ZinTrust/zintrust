---
title: Tasks Demo (A–Z)
description: A single happy-path demo that exercises Zintrust features end-to-end.
---

# Demo: Tasks App (A–Z)

This is a single, happy-path demo that exercises Zintrust **end-to-end**:

- User **register** → **login**
- Create/list/update/complete **tasks**
- Multi-database setup (auth DB vs tasks DB; plus a demo-only dual SQLite setup)
- Mail, storage, queue, cache, notifications, templates, logging, HTTP client
- Adapter packages under `packages/*`
- Ecommerce services under `src/services/*` (where runnable)

All framework imports are from:

- `@zintrust/core` (runtime/public API)
- `@zintrust/core/node` (Node-only helpers)

## 0) Prerequisites

- Node.js >= 20
- `npm i`

Optional local infra (recommended for the “all” run):

- Docker (for Postgres/Redis)

Bring up the repo’s local infra (Postgres + optional Redis profile):

```bash
npm run docker:up
# Optional: include Redis if you use docker compose profiles
# docker-compose --profile optional up -d
```

## 1) Environment variables (multi DB)

This demo uses **named database connections**:

- `auth` → SQLite (users)
- `tasks` → Postgres (tasks)

Demo-only (to prove “multiple connections”):

- `register` → SQLite
- `login` → SQLite

Example `.env`:

```env
# Auth DB (SQLite)
AUTH_DB_PATH=./tmp/auth.sqlite

# Tasks DB (Postgres)
TASKS_DB_HOST=127.0.0.1
TASKS_DB_PORT=5432
TASKS_DB_DATABASE=zintrust_tasks
TASKS_DB_USERNAME=postgres
TASKS_DB_PASSWORD=postgres

# Demo-only: dual sqlite
REGISTER_DB_PATH=./tmp/register.sqlite
LOGIN_DB_PATH=./tmp/login.sqlite

# Optional features
REDIS_URL=redis://localhost:6379
```

## 2) Bootstrap databases (named connections)

Zintrust supports multi-DB via **named ORM instances**. You initialize each connection with `useDatabase(config, name)`.

Important:

- Create/connect named DBs **before** importing/using models that reference them.
- Each named DB must be connected during bootstrap.

```ts
import { Env, useDatabase, type DatabaseConfig } from '@zintrust/core';

export async function initDatabases(): Promise<void> {
  // auth DB (SQLite)
  const authCfg: DatabaseConfig = {
    driver: 'sqlite',
    database: Env.get('AUTH_DB_PATH', './tmp/auth.sqlite'),
  };
  await useDatabase(authCfg, 'auth').connect();

  // tasks DB (Postgres)
  const tasksCfg: DatabaseConfig = {
    driver: 'postgresql',
    host: Env.get('TASKS_DB_HOST', '127.0.0.1'),
    port: Env.getInt('TASKS_DB_PORT', 5432),
    database: Env.get('TASKS_DB_DATABASE', 'zintrust_tasks'),
    username: Env.get('TASKS_DB_USERNAME', 'postgres'),
    password: Env.get('TASKS_DB_PASSWORD', 'postgres'),
  };
  await useDatabase(tasksCfg, 'tasks').connect();

  // Demo-only: two sqlite connections
  await useDatabase(
    { driver: 'sqlite', database: Env.get('REGISTER_DB_PATH', './tmp/register.sqlite') },
    'register'
  ).connect();

  await useDatabase(
    { driver: 'sqlite', database: Env.get('LOGIN_DB_PATH', './tmp/login.sqlite') },
    'login'
  ).connect();
}
```

✅ Expected:

- App boots with both DB connections established.
- Auth queries go to SQLite; tasks queries go to Postgres.

## 3) Models (auth DB vs tasks DB)

Model definitions should point at the correct named connection.

```ts
import { Model } from '@zintrust/core';

export const User = Model.define(
  {
    table: 'users',
    connection: 'auth',
    fillable: ['email', 'password_hash'],
    hidden: ['password_hash'],
    timestamps: true,
    casts: {},
  },
  {}
);

export const Task = Model.define(
  {
    table: 'tasks',
    connection: 'tasks',
    fillable: ['user_id', 'title', 'completed'],
    hidden: [],
    timestamps: true,
    casts: { completed: 'boolean' },
  },
  {}
);
```

✅ Expected:

- Creating a user only touches the SQLite DB.
- Creating a task only touches the Postgres DB.

## 4) Auth: register + login

### Register

```ts
import { ErrorFactory, generateUuid } from '@zintrust/core';

export async function register(email: string, passwordHash: string) {
  if (email.trim() === '') throw ErrorFactory.createValidationError('Email required');

  // Insert into User model (auth DB)
  const user = await User.create({
    email,
    password_hash: passwordHash,
  });

  // Demo-only: override the model connection to prove separation
  // Option A: chain-based override
  await User.db('register').create({
    id: generateUuid(),
    email,
    password_hash: passwordHash,
  });

  return user;
}
```

### Login

```ts
import { ErrorFactory } from '@zintrust/core';

export async function login(email: string, password: string) {
  if (email.trim() === '') throw ErrorFactory.createValidationError('Email required');

  // Lookup in User model (auth DB)
  const user = await User.query().where('email', email).limit(1).first();
  if (!user) throw ErrorFactory.createAuthError('Invalid credentials');

  // Compare password (pseudo-code)
  // if (!verify(password, user.password_hash)) throw ...

  // Demo-only: try to read from 'login' DB
  // This proves 'login' DB is distinct from 'register' DB
  const replicaUser = await User.db('login').query().where('email', email).limit(1).first();
  // console.log('Replica user found:', replicaUser.length > 0);

  return { token: 'demo-token', user };
}
```

### Raw SQL warning (when you must)

Avoid raw SQL in application code whenever possible.

If you must run raw SQL, Zintrust protects you by default: raw queries are **disabled** unless you enable them.

```env
USE_RAW_QRY=true
```

✅ Expected:

- Raw queries throw unless `USE_RAW_QRY=true`.
- Always use parameterized queries to avoid injection.

✅ Expected:

- `/register` creates a user in `auth` DB (and `register` DB).
- `/login` finds user in `auth` DB (but might miss in `login` DB if not synced).

## 5) Tasks CRUD (tasks DB)

### Routes

```ts
import { Router, type IRouter } from '@zintrust/core';
import { TasksController } from './TasksController';

export function registerRoutes(router: IRouter) {
  Router.group(router, '/api/v1', (r) => {
    Router.post(r, '/register', (ctx) => register(ctx.body.email, ctx.body.password));
    Router.post(r, '/login', (ctx) => login(ctx.body.email, ctx.body.password));

    Router.resource(r, '/tasks', TasksController);
  });
}
```

### Tasks Controller

```ts
import { Cache, Queue, Storage, Notification, HttpClient, Logger } from '@zintrust/core';

export const TasksController = {
  async index(ctx: any) {
    // Cache the task list for 60s
    return Cache.remember(`tasks_user_${ctx.user.id}`, 60, async () => {
      return Task.findAll({ where: { user_id: ctx.user.id } });
    });
  },

  async store(ctx: any) {
    const task = await Task.create({
      user_id: ctx.user.id,
      title: ctx.body.title,
      completed: false,
    });

    // Enqueue email job
    await Queue.dispatch('send_email', {
      to: ctx.user.email,
      subject: 'Task Created',
      body: `You created task: ${task.title}`,
    });

    return task;
  },

  async update(ctx: any) {
    const task = await Task.find(ctx.params.id);
    if (!task) return ctx.status(404);

    task.fill(ctx.body);
    await task.save();

    if (task.completed) {
      // Send notification
      await Notification.send('slack', {
        message: `Task completed: ${task.title}`,
      });

      // Call external service (Ecommerce) to reward user
      try {
        await HttpClient.post('http://ecommerce-orders:3002/rewards', {
          user_id: ctx.user.id,
          reason: 'task_completion',
        });
      } catch (err) {
        Logger.error('Failed to reward user', { err });
      }
    }

    return task;
  },
};
```

✅ Expected:

- Tasks persist in Postgres.
- `index` caches results.
- `store` enqueues email.
- `update` (complete) sends notification + calls external service.

## 6) Cache (packages/cache-redis, packages/cache-mongodb)

Local default: memory cache (no infra).

Optional: Redis cache (requires `REDIS_URL` and redis container).

Adapter install pattern (in a consumer app):

```ts
import '@zintrust/cache-redis/register';
```

✅ Expected:

- Listing tasks uses cache (hit on second request).

## 7) Queue (packages/queue-redis, queue-rabbitmq, queue-sqs)

Local default: in-memory queue.

Optional: Redis queue:

```ts
import '@zintrust/queue-redis/register';
```

Provider-required (optional):

- RabbitMQ queue: `@zintrust/queue-rabbitmq` (needs RabbitMQ running)
- SQS queue: `@zintrust/queue-sqs` (needs AWS credentials + queue URL)

✅ Expected:

- Creating a task enqueues a “send email” job.
- Worker dequeues and processes successfully.

## 8) Mail (packages/mail-\*)

Local default: fake mailer (assert sends in tests).

```ts
import { MailFake } from '@zintrust/core/node';
```

Provider-required (optional):

- SendGrid: `@zintrust/mail-sendgrid`
- Mailgun: `@zintrust/mail-mailgun`
- SMTP: `@zintrust/mail-smtp`
- Nodemailer: `@zintrust/mail-nodemailer`

✅ Expected:

- After register, a welcome email is “sent”.

## 9) Storage (packages/storage-\*)

Local default:

- `FakeStorage` (tests)
- local disk storage driver (dev)

```ts
import { FakeStorage } from '@zintrust/core/node';
```

Optional provider steps:

- S3 (`@zintrust/storage-s3`) with MinIO or AWS
- R2 (`@zintrust/storage-r2`) Cloudflare
- GCS (`@zintrust/storage-gcs`) Google

✅ Expected:

- Task can upload an attachment and later download it.

## 10) Notifications & Broadcast

### Notifications (Slack/SMS)

```ts
import { sendSlackWebhook, sendSms } from '@zintrust/core';
```

### Broadcast (Real-time)

Broadcast events to connected clients (e.g., via WebSocket or SSE).

```ts
import { broadcast } from '@zintrust/core';

// In TasksController.update:
if (task.completed) {
  await broadcast('task.completed', {
    id: task.id,
    title: task.title,
    user_id: task.user_id,
  });
}
```

✅ Expected:

- On task completion, a notification is emitted.
- Connected clients receive the `task.completed` event.

## 11) Templates (Markdown templates)

```ts
import { MarkdownRenderer } from '@zintrust/core';
```

Node-only template helpers (optional):

```ts
import {
  listTemplates,
  loadTemplate,
  renderTemplate,
  listNotificationTemplates,
  loadNotificationTemplate,
  renderNotificationTemplate,
} from '@zintrust/core/node';
```

✅ Expected:

- Emails/notifications render Markdown templates.

## 12) Logging + HTTP client

```ts
import { HttpClient, Logger } from '@zintrust/core';
```

✅ Expected:

- Calls to external services are logged.
- Sensitive fields are not logged.

## 13) Adapter packages checklist (A–Z)

This demo should touch each adapter package at least once:

- Cache: `@zintrust/cache-redis`, `@zintrust/cache-mongodb`
- DB: `@zintrust/db-sqlite`, `@zintrust/db-postgres`, `@zintrust/db-mysql`, `@zintrust/db-sqlserver`, `@zintrust/db-d1`
- Mail: `@zintrust/mail-smtp`, `@zintrust/mail-nodemailer`, `@zintrust/mail-sendgrid`, `@zintrust/mail-mailgun`
- Queue: `@zintrust/queue-redis`, `@zintrust/queue-rabbitmq`, `@zintrust/queue-sqs`
- Storage: `@zintrust/storage-s3`, `@zintrust/storage-r2`, `@zintrust/storage-gcs`
- Cloudflare proxies: `@zintrust/cloudflare-d1-proxy`, `@zintrust/cloudflare-kv-proxy`

## 14) Services checklist (A–Z)

Ecommerce services live under `src/services/ecommerce/*`.

Notes:

- The compose file exists under `src/services/ecommerce/docker-compose.yml`.
- Some docker build paths/Dockerfiles referenced by the compose may require syncing/generation.

### Integration Example

When a task is completed, we call the **Orders Service** to issue a reward.

```ts
// src/services/Ecommerce.ts
import { HttpClient, Logger } from '@zintrust/core';

export const EcommerceService = {
  async issueReward(userId: string) {
    try {
      // Call the internal microservice URL (e.g. via Docker network)
      const response = await HttpClient.post('http://ecommerce-orders:3002/rewards', {
        user_id: userId,
        reason: 'task_completion',
        amount: 10, // 10 points reward
      });
      return response.data;
    } catch (err) {
      Logger.error('Ecommerce service unavailable', { err });
      // Fallback or retry logic
      return null;
    }
  },
};
```

✅ Expected:

- At minimum, Postgres in that compose is runnable.
- Once Dockerfile paths are aligned, users/orders/payments/gateway can be booted and called.
- The Tasks app successfully calls the Orders service (or logs an error if down).
