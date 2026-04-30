# Docker: Schedule Runtime & Trace Runtime

ZinTrust ships two standalone runtime directories under `docker/` that act as isolated mini-apps for the **schedule daemon** and the **trace dashboard**. Neither is part of the main application image — each has its own `package.json`, its own adapter registrations, and its own Docker build context.

Understanding why they exist, what files live in them, and what a new developer must create is the goal of this page.

---

## Why separate runtimes?

| Concern          | Schedule Runtime                                                                     | Trace Runtime                                            |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Purpose**      | Run `zin schedule:start` in its own container                                        | Serve the trace dashboard + ingest gateway               |
| **Dependencies** | Only the adapters the schedule handlers actually use (Redis, D1, mail, queue, cache) | Only `@zintrust/db-sqlite` and `@zintrust/trace`         |
| **Database**     | Same DB as the app (via env vars)                                                    | Dedicated SQLite file — separate from the app DB         |
| **Image size**   | Slim — no build tools, no Worker packages                                            | Slim — no queue, no Redis, no mail                       |
| **Routing**      | None — no HTTP surface                                                               | Exposes `/trace` dashboard and `/zin/trace/write` ingest |

Running these concerns inside the main app container would mean:

- The schedule daemon competes with request handling for CPU/memory.
- The trace dashboard writes to the same DB connection pool the app uses.
- Container restarts for app deployments kill in-flight schedule runs.
- Log streams from three different concerns mix in one container.

Separate containers fix all of the above.

---

## Folder tree

Both directories live under `docker/` and are tracked in git:

```
docker/
├── schedule-runtime/
│   ├── package.json
│   └── src/
│       └── zintrust.plugins.js
└── trace-runtime/
    ├── package.json
    ├── config/
    │   ├── database.js
    │   ├── queue.js
    │   ├── trace.js
    │   └── workers.js
    ├── routes/
    │   └── api.js
    └── src/
        ├── zintrust.plugins.js
        └── zintrust.runtime.js
```

---

## File snapshots

### `docker/schedule-runtime/package.json`

Declares only the adapters the schedule handlers in your project actually import. Adjust the list to match your project's real dependencies.

```json
{
  "name": "vizo-schedule-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "@zintrust/cache-redis": "^1.6.0",
    "@zintrust/core": "^1.6.0",
    "@zintrust/db-d1": "^1.6.0",
    "@zintrust/mail-smtp": "^1.6.0",
    "@zintrust/queue-redis": "^1.6.0",
    "bcryptjs": "^3.0.3",
    "crypto-js": "^4.2.0",
    "hashids": "^2.3.0",
    "otplib": "^13.4.0",
    "tsx": "^4.21.0",
    "typescript": "^6.0.3"
  }
}
```

> **Tip:** Pin versions to the same range as the main app `package.json` so adapter ABIs stay aligned.

---

### `docker/schedule-runtime/src/zintrust.plugins.js`

Registers exactly the adapters listed in `package.json`. This is the equivalent of your main app's `src/zintrust.plugins.ts` — but isolated to schedule-only needs.

```js
import '@zintrust/cache-redis/register';
import '@zintrust/db-d1/register';
import '@zintrust/mail-smtp/register';
import '@zintrust/queue-redis/register';
```

---

### `docker/trace-runtime/package.json`

The trace container only needs core, SQLite, and the trace package itself.

```json
{
  "name": "vizo-trace-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "@zintrust/core": "^1.6.0",
    "@zintrust/db-sqlite": "^1.6.0",
    "@zintrust/trace": "^1.6.0"
  }
}
```

---

### `docker/trace-runtime/src/zintrust.plugins.js`

```js
import '@zintrust/db-sqlite/register';
```

---

### `docker/trace-runtime/src/zintrust.runtime.js`

Declares an empty service manifest — the trace runtime boots as a single-service node with no microservice peers.

```js
export const serviceManifest = [];

export default Object.freeze({ serviceManifest });
```

---

### `docker/trace-runtime/config/database.js`

Reads the SQLite path from env. The trace runtime writes to a **separate** SQLite file so trace storage never touches the main app database.

```js
import { Env } from '@zintrust/core';

export default {
  default: 'sqlite',
  connections: {
    sqlite: {
      driver: 'sqlite',
      database: Env.get(
        'DB_DATABASE_SQLITE',
        Env.get('DB_PATH', '.zintrust/dbs/trace-runtime.sqlite')
      ),
      migrations: 'database/migrations',
    },
  },
};
```

---

### `docker/trace-runtime/config/trace.js`

Controls which watchers are active and the retention window. All watchers default to `false` — enable only what you need to limit write volume.

```js
import { Env } from '@zintrust/core';

export default {
  enabled: true,
  connection: 'sqlite',
  pruneAfterHours: Env.getInt('TRACE_PRUNE_HOURS', 72),
  ignoreRoutes: ['/trace', '/trace/api'],
  ignorePaths: ['/trace', '/trace/api', '.js', '.css'],
  captureCachePayloads: false,
  captureQueryBindings: false,
  contentDispatch: {
    driver: undefined,
    worker: {
      enabled: false,
      intervalMs: 0,
      maxDurationMs: 0,
      concurrency: 0,
    },
    queueName: '',
    enqueueTimeoutMs: 0,
  },
  watchers: {
    request: false,
    query: false,
    exception: false,
    log: false,
    job: false,
    cache: false,
    schedule: false,
    mail: false,
    auth: false,
    event: false,
    model: false,
    notification: false,
    redis: false,
    gate: false,
    middleware: false,
    command: false,
    batch: false,
    dump: false,
    view: false,
    clientRequest: false,
  },
};
```

---

### `docker/trace-runtime/config/queue.js`

The trace runtime does not need an async queue — it uses the sync driver.

```js
export default {
  default: 'sync',
  drivers: {
    sync: { driver: 'sync' },
  },
  monitor: { enabled: false },
};
```

---

### `docker/trace-runtime/config/workers.js`

Workers are disabled in the trace runtime.

```js
export default {
  enabled: false,
};
```

---

### `docker/trace-runtime/routes/api.js`

Mounts the trace dashboard and the ingest gateway. The ingest path (`/zin/trace/write`) is the signed endpoint your main app posts trace entries to when `TRACE_PROXY=true`.

```js
import { Env, isUndefinedOrNull } from '@zintrust/core';
import { registerTraceIngestGateway } from '@zintrust/trace';
import { registerTraceDashboard } from '@zintrust/trace/ui';

const getTraceBasePath = () => {
  const configured = Env.get('TRACE_BASE_PATH', '/trace').trim();
  return isUndefinedOrNull(configured) ? '/trace' : configured;
};

const getTraceConnectionName = () => {
  const configured = Env.get('TRACE_DB_CONNECTION', 'sqlite').trim();
  return isUndefinedOrNull(configured) ? undefined : configured;
};

export function registerRoutes(router) {
  registerTraceDashboard(router, {
    basePath: getTraceBasePath(),
    connectionName: getTraceConnectionName(),
  });

  registerTraceIngestGateway(router, {
    basePath: Env.get('TRACE_PROXY_PATH', '/zin/trace/write'),
    connectionName: getTraceConnectionName(),
  });
}
```

---

## What a new developer must create

These directories are tracked in git so a fresh `git clone` already has all the source files above. What is **not** in git:

1. `node_modules/` inside each directory (always gitignored)
2. A `Dockerfile` for each runtime (you write these per project — see samples below)
3. A docker-compose service entry wiring each runtime into your stack

### Step 1 — Install dependencies

Run inside each directory before building Docker images:

```bash
cd docker/schedule-runtime && npm install && cd ../..
cd docker/trace-runtime   && npm install && cd ../..
```

These installs are independent of the main project's `npm install`. They produce separate `node_modules` trees inside each runtime directory.

### Step 2 — Create a Dockerfile for each runtime

#### `docker/schedule-runtime/Dockerfile` (sample)

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy runtime package manifest and install
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled app from the main project build (mounted or pre-built)
# Adjust the COPY source to match how you build and deliver dist/ to this container
COPY ../../dist ./dist

# Copy the isolated plugin entrypoint
COPY src/ ./src/

ENV NODE_ENV=production
ENV SCHEDULES_ENABLED=true

CMD ["node", "dist/bin/zin.js", "schedule:start"]
```

> **Alternative pattern:** build the main app in a multi-stage builder and `COPY --from=builder` the `dist/` folder into this image. This avoids keeping a separate build step for the schedule container.

#### `docker/trace-runtime/Dockerfile` (sample)

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy runtime package manifest and install
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy config, routes, and plugin entrypoints
COPY config/ ./config/
COPY routes/ ./routes/
COPY src/ ./src/

# Persistent trace DB volume mount point
RUN mkdir -p .zintrust/dbs

ENV NODE_ENV=production
ENV PORT=7778
ENV HOST=0.0.0.0
ENV TRACE_ENABLED=true
ENV TRACE_BASE_PATH=/trace
ENV TRACE_PROXY_PATH=/zin/trace/write

EXPOSE 7778

CMD ["node", "--import", "@zintrust/core/register", "src/zintrust.runtime.js"]
```

### Step 3 — Add docker-compose service entries

#### Schedule daemon service (add to `docker-compose.schedules.yml`)

```yaml
schedules-isolated:
  build:
    context: docker/schedule-runtime
    dockerfile: Dockerfile
  environment:
    NODE_ENV: ${NODE_ENV:-production}
    SCHEDULES_ENABLED: 'true'
    REDIS_HOST: ${DOCKER_REDIS_HOST:-host.docker.internal}
    REDIS_PORT: ${REDIS_PORT:-6379}
    REDIS_PASSWORD: ${REDIS_PASSWORD:-}
    DB_CONNECTION: ${DB_CONNECTION:-postgresql}
    DB_HOST: ${DOCKER_DB_HOST:-host.docker.internal}
    DB_DATABASE_POSTGRESQL: ${DB_DATABASE_POSTGRESQL:-zintrust}
    DB_USERNAME_POSTGRESQL: ${DB_USERNAME_POSTGRESQL:-zintrust}
    DB_PASSWORD_POSTGRESQL: ${DB_PASSWORD_POSTGRESQL:-zintrust}
  networks:
    - zintrust-network
```

#### Trace service (new compose file or added to an existing one)

```yaml
trace:
  build:
    context: docker/trace-runtime
    dockerfile: Dockerfile
  ports:
    - '${TRACE_PORT:-7778}:7778'
  environment:
    NODE_ENV: ${NODE_ENV:-production}
    APP_NAME: ${APP_NAME:-ZinTrust}
    APP_KEY: ${APP_KEY}
    PORT: 7778
    TRACE_ENABLED: 'true'
    TRACE_BASE_PATH: ${TRACE_BASE_PATH:-/trace}
    TRACE_PROXY_PATH: ${TRACE_PROXY_PATH:-/zin/trace/write}
    TRACE_PROXY_KEY_ID: ${TRACE_PROXY_KEY_ID:-}
    TRACE_PROXY_SECRET: ${TRACE_PROXY_SECRET:-}
    TRACE_PRUNE_HOURS: ${TRACE_PRUNE_HOURS:-72}
    DB_DATABASE_SQLITE: ${TRACE_DB_PATH:-.zintrust/dbs/trace-runtime.sqlite}
  volumes:
    - trace_data:/app/.zintrust/dbs
  networks:
    - zintrust-network

volumes:
  trace_data:
```

---

## How the main app sends traces to the trace runtime

When the trace container is running, set these env vars in the **main app**:

```env
TRACE_ENABLED=true
TRACE_PROXY=true
TRACE_PROXY_URL=http://trace:7778
TRACE_PROXY_PATH=/zin/trace/write
TRACE_PROXY_KEY_ID=your-key-id
TRACE_PROXY_SECRET=your-secret
```

The app builds trace entries locally but posts them to the trace container via the signed ingest gateway rather than writing to its own database. The trace container verifies the HMAC signature and writes to its own SQLite file.

See [package-trace.md](./package-trace.md) for the full trace configuration reference.

---

## Summary checklist for new developers

```
[ ] git clone → docker/schedule-runtime/ and docker/trace-runtime/ already exist
[ ] cd docker/schedule-runtime && npm install
[ ] cd docker/trace-runtime   && npm install
[ ] Create docker/schedule-runtime/Dockerfile  (use the sample above)
[ ] Create docker/trace-runtime/Dockerfile     (use the sample above)
[ ] Add schedule service to docker-compose.schedules.yml
[ ] Add trace service to your compose file and expose port 7778
[ ] Set TRACE_PROXY=true + proxy keys in the main app env
[ ] docker compose ... up -d
```
