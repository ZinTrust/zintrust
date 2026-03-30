import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { copyFileSync, existsSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

const DOCKER_COMPOSE_WORKERS_TEMPLATE = `name: zintrust-workers

services:
  # Worker runtime service (Port 7772)
  # Boots the full ZinTrust server so the worker pages stay reachable while workers auto-start.
  workers-api:
    image: \${WORKERS_IMAGE:-zintrust-workers-local:latest}
    build:
      context: .
      dockerfile: Dockerfile.workers
      target: worker
    environment:
      # Runtime
      - NODE_ENV=\${NODE_ENV:-development}
      - PORT=7772
      - HOST=0.0.0.0
      - RUNTIME_MODE=node-server

      # Application
      - APP_NAME=\${APP_NAME:-ZinTrust}
      - APP_KEY=\${APP_KEY}
      - ENCRYPTION_CIPHER=\${ENCRYPTION_CIPHER:-aes-256-cbc}
      - LOG_LEVEL=\${LOG_LEVEL:-info}

      # Workers & Queue
      - WORKER_ENABLED=\${WORKER_ENABLED:-true}
      - WORKER_AUTO_START=\${WORKER_AUTO_START:-true}
      - QUEUE_ENABLED=true
      - QUEUE_MONITOR_ENABLED=\${QUEUE_MONITOR_ENABLED:-false}
      - QUEUE_MONITOR_MIDDLEWARE=\${QUEUE_MONITOR_MIDDLEWARE:-}
      - WORKER_PERSISTENCE_DRIVER=\${WORKER_PERSISTENCE_DRIVER:-redis}
      - WORKER_PERSISTENCE_DB_CONNECTION=\${WORKER_PERSISTENCE_DB_CONNECTION:-mysql}
      - WORKER_PERSISTENCE_REDIS_KEY_PREFIX=\${WORKER_PERSISTENCE_REDIS_KEY_PREFIX}
      - QUEUE_DRIVER=\${QUEUE_DRIVER:-redis}
      - QUEUE_CONNECTION=\${QUEUE_CONNECTION:-redis}
      - CACHE_DRIVER=\${CACHE_DRIVER:-redis}

      # Redis
      - REDIS_HOST=\${DOCKER_REDIS_HOST:-host.docker.internal}
      - REDIS_PORT=\${REDIS_PORT:-6379}
      - REDIS_PASSWORD=\${REDIS_PASSWORD}
      - REDIS_QUEUE_DB=\${REDIS_QUEUE_DB:-1}

      # Database
      - DB_CONNECTION=\${DB_CONNECTION:-postgres}
      - DB_HOST=\${DOCKER_DB_HOST:-host.docker.internal}
      - DB_PORT=\${DB_PORT:-3306}
      - DB_DATABASE=\${DB_DATABASE:-zintrust}
      - DB_USERNAME=\${DB_USERNAME:-zintrust}
      - DB_PASSWORD=\${DB_PASSWORD:-}

      # SMTP Mail
      - MAIL_DRIVER=\${MAIL_DRIVER:-smtp}
      - MAIL_CONNECTION=\${MAIL_CONNECTION:-smtp}
      - MAIL_HOST=\${MAIL_HOST}
      - MAIL_PORT=\${MAIL_PORT:-587}
      - MAIL_SECURE=\${MAIL_SECURE:-false}
      - MAIL_USERNAME=\${MAIL_USERNAME}
      - MAIL_PASSWORD=\${MAIL_PASSWORD}
      - MAIL_FROM_ADDRESS=\${MAIL_FROM_ADDRESS}
      - MAIL_FROM_NAME=\${MAIL_FROM_NAME:-ZinTrust}

      # PostgreSQL
      - DB_PORT_POSTGRESQL=\${DB_PORT_POSTGRESQL:-5432}
      - DB_DATABASE_POSTGRESQL=\${DB_DATABASE_POSTGRESQL:-zintrust}
      - DB_USERNAME_POSTGRESQL=\${DB_USERNAME_POSTGRESQL:-zintrust}
      - DB_PASSWORD_POSTGRESQL=\${DB_PASSWORD_POSTGRESQL:-}

      # MySQL
      - DB_PORT_MYSQL=\${DB_PORT_MYSQL:-3306}
      - DB_DATABASE_MYSQL=\${DB_DATABASE_MYSQL:-zintrust}
      - DB_USERNAME_MYSQL=\${DB_USERNAME_MYSQL:-zintrust}
      - DB_PASSWORD_MYSQL=\${DB_PASSWORD_MYSQL:-}

      # Cloudflare D1
      - D1_DATABASE_ID=\${D1_DATABASE_ID}
      - D1_ACCOUNT_ID=\${D1_ACCOUNT_ID}
      - D1_API_TOKEN=\${D1_API_TOKEN}
      - D1_REMOTE_URL=\${D1_REMOTE_URL}
      - D1_REMOTE_KEY_ID=\${D1_REMOTE_KEY_ID}
      - D1_REMOTE_SECRET=\${D1_REMOTE_SECRET}

      # Cloudflare KV
      - KV_NAMESPACE_ID=\${KV_NAMESPACE_ID}
      - KV_ACCOUNT_ID=\${KV_ACCOUNT_ID}
      - KV_API_TOKEN=\${KV_API_TOKEN}
      - KV_REMOTE_URL=\${KV_REMOTE_URL}
      - KV_REMOTE_KEY_ID=\${KV_REMOTE_KEY_ID}
      - KV_REMOTE_SECRET=\${KV_REMOTE_SECRET}
    ports:
      - '7772:7772'

`;

const DOCKERFILE_TEMPLATE = String.raw`# Multi-stage worker overlay image.
#
# This compiles the local ZinTrust app first, then copies only the compiled worker-related
# artifacts onto the published zintrust/zintrust runtime image.

FROM node:20-alpine AS project-build

WORKDIR /project

ENV NPM_CONFIG_CACHE=/root/.npm
ENV NPM_CONFIG_PREFER_OFFLINE=true

RUN apk upgrade --no-cache \
  && apk add --no-cache g++ git make python3

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm,id=zintrust-worker-overlay-npm-cache,sharing=locked \
  npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm ci

COPY . .

# Fresh projects always ship npm run build; do not depend on framework-internal build variants.
RUN --mount=type=cache,target=/root/.npm,id=zintrust-worker-overlay-npm-cache,sharing=locked npm run build

FROM project-build AS worker-overlay

RUN set -eu; \
  overlay_root=/overlay; \
  mkdir -p "$overlay_root/dist"; \
  if [ -d /project/dist/app ]; then cp -R /project/dist/app "$overlay_root/dist/app"; fi; \
  mkdir -p "$overlay_root/dist/src"; \
  if [ -f /project/dist/src/zintrust.workers.js ]; then cp /project/dist/src/zintrust.workers.js "$overlay_root/dist/src/zintrust.workers.js"; fi; \
  if [ -f /project/dist/src/zintrust.workers.js.map ]; then cp /project/dist/src/zintrust.workers.js.map "$overlay_root/dist/src/zintrust.workers.js.map"; fi

FROM zintrust/zintrust:latest AS runtime

WORKDIR /app

COPY --from=worker-overlay --chown=nodejs:nodejs /overlay/dist/ /app/dist/

FROM runtime AS worker

ENV WORKER_ENABLED=true
ENV WORKER_AUTO_START=true
ENV QUEUE_ENABLED=true
ENV HOST=0.0.0.0
ENV PORT=7772

HEALTHCHECK NONE

CMD ["node", "--experimental-specifier-resolution=node", "dist/src/boot/bootstrap.js"]
`;

const backupSuffix = (): string => new Date().toISOString().replaceAll(/[:.]/g, '-');

const backupFileIfExists = (filePath: string): void => {
  if (!existsSync(filePath)) return;
  const backupPath = `${filePath}.bak.${backupSuffix()}`;
  copyFileSync(filePath, backupPath);
  Logger.info(`🗂️ Backup created: ${backupPath}`);
};

async function writeDockerComposeFile(cwd: string): Promise<void> {
  const composePath = join(cwd, 'docker-compose.workers.yml');

  let shouldWrite = true;
  if (existsSync(composePath)) {
    shouldWrite = await PromptHelper.confirm(
      'docker-compose.workers.yml already exists. Overwrite?',
      false
    );
  }

  if (shouldWrite) {
    backupFileIfExists(composePath);
    writeFileSync(composePath, DOCKER_COMPOSE_WORKERS_TEMPLATE);
    Logger.info('✅ Created docker-compose.workers.yml');
  } else {
    Logger.info('Skipped docker-compose.workers.yml');
  }
}

async function writeDockerfile(cwd: string): Promise<void> {
  const dockerfilePath = join(cwd, 'Dockerfile.workers');

  let shouldWrite = true;
  if (existsSync(dockerfilePath)) {
    shouldWrite = await PromptHelper.confirm(
      'Dockerfile.workers already exists. Overwrite with the ZinTrust worker overlay image?',
      false
    );
  }

  if (shouldWrite) {
    backupFileIfExists(dockerfilePath);
    writeFileSync(dockerfilePath, DOCKERFILE_TEMPLATE);
    Logger.info('✅ Created Dockerfile.workers');
  } else {
    Logger.info('Skipped Dockerfile.workers');
  }
}

export const InitContainerCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:container-workers',
      aliases: ['init:cw', 'init:cwr', 'init:container-workers-routes'],
      description: 'Initialize container-based worker infrastructure',
      async execute(): Promise<void> {
        Logger.info('Initializing container-based worker infrastructure...');

        const cwd = process.cwd();
        await writeDockerComposeFile(cwd);
        await writeDockerfile(cwd);

        Logger.info('✅ Container worker scaffolding complete.');
        Logger.info('Run with: docker compose -f docker-compose.workers.yml up');
        Logger.info(
          'Build worker runtime with: docker build -f Dockerfile.workers --target worker .'
        );
        await Promise.resolve();
      },
    });
  },
});
