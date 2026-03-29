# Docker Workers

ZinTrust ships a single monolith Docker image for the app runtime and worker/scheduler processes.

## Image

- Runtime image: `zintrust/zintrust`

## Quick start

The ZinTrust-native pattern for custom worker images is to extend the published `zintrust/zintrust`
image with a project build stage.

That means:

1. your project still owns `app/Workers` and optional `src/zintrust.workers.ts`
2. a builder stage runs `npm run build`
3. the final image copies compiled worker artifacts onto `zintrust/zintrust`
4. the normal ZinTrust runtime auto-discovers `dist/app/Workers` and auto-loads `dist/src/zintrust.workers.js`

This keeps the runtime image stable while still letting developers use either the `Workers` folder or
the explicit `zintrust.workers.ts` entrypoint.

## Scaffolded overlay image

Generate the standard files with:

```bash
zin init:cw
```

This scaffolds:

- `docker-compose.workers.yml`
- `Dockerfile.workers`

The generated `Dockerfile.workers` builds the local project with `npm run build`, then overlays the
compiled app worker artifacts onto the published `zintrust/zintrust` base image.

The generated compose stack now includes a single service:

- `workers-api`: a bootstrap-driven runtime built from the `worker` target that serves the worker pages and auto-starts eligible workers in the same process

The image name in `docker-compose.workers.yml` is the overlay result image:

- `WORKERS_IMAGE` defaults to `zintrust-workers-local:latest`

These are not the published base image names. The scaffolded overlay still uses `FROM zintrust/zintrust:latest`
inside `Dockerfile.workers`, then layers your compiled project workers onto that base.

Generated compose shape:

```yaml
services:
  workers-api:
    image: ${WORKERS_IMAGE:-zintrust-workers-local:latest}
    build:
      context: .
      dockerfile: Dockerfile.workers
      target: worker
    ports:
      - '7772:7772'
```

The generated service uses the worker target so the container boots the full HTTP runtime and starts workers in the same process.

For fresh apps, the simplest Docker worker flow is code-first:

1. Create worker files under `app/Workers/` that export `workerDefinition` and `ZinTrustProcessor`.
2. Optionally keep advanced grouped imports or pre-registration logic in `src/zintrust.workers.ts`.
3. Build your app image normally. TypeScript compilation emits `dist/src/zintrust.workers.js` automatically.
4. Start the worker container with `WORKER_ENABLED=true` and `WORKER_AUTO_START=true`.

The ZinTrust worker image auto-loads `src/zintrust.workers.ts` or its compiled `dist/src/zintrust.workers.js`
when present. You do not need to manually copy worker bootstrap files into the container.

## End-to-End Example

### 1. Create a worker file

```typescript
// app/Workers/InvoiceWorker.ts
import { Logger } from '@zintrust/core';

export const workerDefinition = Object.freeze({
  name: 'invoice-worker',
  queueName: 'invoice-worker',
  version: '1.0.0',
  autoStart: true,
  activeStatus: true,
  concurrency: 1,
  processorSpec: 'app/Workers/InvoiceWorker.ts',
});

export async function ZinTrustProcessor(payload: unknown): Promise<void> {
  Logger.info('Invoice worker processed job', { payload });
}

export default ZinTrustProcessor;
```

### 2. Optionally keep a project worker bootstrap file

```typescript
// src/zintrust.workers.ts
import '@app/Workers/InvoiceWorker';
```

For simple workers, this file can stay minimal. Its main job is to give Docker workers and worker CLI
commands a stable project-owned entrypoint when you want grouped imports or pre-registration logic.

### 3. Build the worker overlay image

```bash
docker build -f Dockerfile.workers --target worker -t my-app-workers .
```

No manual copy step is needed. The project build emits `dist/app/Workers/*` and, when present,
`dist/src/zintrust.workers.js`, and the overlay image copies them into the final runtime image.

### 4. Start the worker container

```bash
docker run --rm \
	-e WORKER_ENABLED=true \
	-e WORKER_AUTO_START=true \
	-e WORKER_PERSISTENCE_DRIVER=memory \
	-e QUEUE_DRIVER=memory \
	my-app-workers
```

With this setup, fresh apps can start file-backed workers even when no worker rows have been created in
the database yet.

## Official extension Dockerfile

The scaffolded worker overlay uses this model:

```dockerfile
FROM node:20-alpine AS project-build

WORKDIR /project

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM project-build AS worker-overlay

RUN set -eu; \
  overlay_root=/overlay; \
  mkdir -p "$overlay_root/dist"; \
  if [ -d /project/dist/app ]; then cp -R /project/dist/app "$overlay_root/dist/app"; fi; \
  mkdir -p "$overlay_root/dist/src"; \
  if [ -f /project/dist/src/zintrust.workers.js ]; then cp /project/dist/src/zintrust.workers.js "$overlay_root/dist/src/zintrust.workers.js"; fi

FROM zintrust/zintrust:latest AS runtime

WORKDIR /app

COPY --from=worker-overlay /overlay/dist/ /app/dist/

FROM runtime AS worker

ENV WORKER_ENABLED=true
ENV WORKER_AUTO_START=true
ENV QUEUE_ENABLED=true
ENV HOST=0.0.0.0
ENV PORT=7772

CMD ["node", "--experimental-specifier-resolution=node", "dist/src/boot/bootstrap.js"]
```

Why this is the supported path:

- the published `zintrust/zintrust` runtime image is kept stable
- fresh apps do not need framework-internal scripts like `npm run build:dk`
- developers can choose either file-backed worker discovery from `app/Workers` or explicit bootstrap through `src/zintrust.workers.ts`
- only compiled worker artifacts are copied into the final image

### Workers stack

```bash
docker compose -f docker-compose.workers.yml up -d
```

That command now starts a single bootstrap-driven worker runtime that serves the worker pages and auto-starts eligible workers.

### Schedules stack

```bash
docker compose -f docker-compose.schedules.yml up -d
```

## Pin overlay image tags

```bash
WORKERS_IMAGE=myorg/my-app-workers:<version> \
docker compose -f docker-compose.workers.yml up -d
```

If you want the overlay build itself to inherit from a specific published ZinTrust base tag, update the
`FROM zintrust/zintrust:<tag>` line in `Dockerfile.workers` before building the overlay image.

## Publishing images (maintainers)

```bash
zin docker push --tag <version>
```

Common options:

- `--platforms linux/amd64,linux/arm64`
- `--no-also-latest`
- `--only runtime|worker|gateway|both`

## Plug-and-Play Worker Entrypoint

Fresh projects can ship an optional `src/zintrust.workers.ts` file. Docker worker containers and
worker CLI commands auto-load the compiled `dist/src/zintrust.workers.js` form of this file before
starting workers.

Use it when you want a single project-owned place for:

- grouped worker imports
- processor spec pre-registration
- custom worker bootstrap logic

For simple workers that already export `workerDefinition`, auto-discovery still works even if you do
not edit `src/zintrust.workers.ts`.
