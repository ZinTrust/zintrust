import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { Logger } from '@config/logger';
import { writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

const DOCKER_COMPOSE_WORKERS_ROUTES_TEMPLATE = `
services:
  # Workers/Jobs API Service (Port 7772)
  # Exposes the Workers API to create/manage jobs
  workers-api:
    build:
      context: .
      dockerfile: Dockerfile
    # Use compiled JS entry point to avoid 'tsx not found' error in production image
    command: ["node", "dist/src/boot/bootstrap.js"]
    environment:
      - NODE_ENV=\${NODE_ENV:-production}
      - PORT=7772
      - HOST=0.0.0.0
      - RUNTIME_MODE=node-server

      # App Core
      - APP_NAME=\${APP_NAME:-ZinTrust}
      - APP_KEY=\${APP_KEY}
      - LOG_LEVEL=\${LOG_LEVEL:-info}

      # Feature Flags
      - WORKER_ENABLED=false
      - WORKER_AUTO_START=false
      - QUEUE_ENABLED=true
      - QUEUE_MONITOR_MIDDLEWARE=\${QUEUE_MONITOR_MIDDLEWARE:-}

      # Persistence & Drivers
      - WORKER_PERSISTENCE_DRIVER=\${WORKER_PERSISTENCE_DRIVER:-redis}
      - WORKER_PERSISTENCE_DB_CONNECTION=\${WORKER_PERSISTENCE_DB_CONNECTION:-mysql}
      - WORKER_PERSISTENCE_REDIS_KEY_PREFIX=\${WORKER_PERSISTENCE_REDIS_KEY_PREFIX:-worker_zintrust}

      - QUEUE_DRIVER=\${QUEUE_DRIVER:-redis}
      - QUEUE_CONNECTION=\${QUEUE_CONNECTION:-redis}
      - CACHE_DRIVER=\${CACHE_DRIVER:-redis}

      # Redis Configuration (Host)
      - REDIS_HOST=\${DOCKER_REDIS_HOST:-host.docker.internal}
      - REDIS_PORT=\${REDIS_PORT:-6379}
      - REDIS_PASSWORD=\${REDIS_PASSWORD}
      - REDIS_QUEUE_DB=\${REDIS_QUEUE_DB:-1}

      # Database Drivers (Complete Support)
      # PostgreSQL
      - DB_CONNECTION=\${DB_CONNECTION:-postgres}
      - DB_HOST=\${DOCKER_DB_HOST:-host.docker.internal}
      - DB_PORT=\${DB_PORT:-3306}
      - DB_DATABASE=\${DB_DATABASE:-zintrust}
      - DB_USERNAME=\${DB_USERNAME:-zintrust}
      - DB_PASSWORD=\${DB_PASSWORD:-secret}
      - DB_PORT_POSTGRESQL=\${DB_PORT_POSTGRESQL:-5432}
      - DB_DATABASE_POSTGRESQL=\${DB_DATABASE_POSTGRESQL:-zintrust}
      - DB_USERNAME_POSTGRESQL=\${DB_USERNAME_POSTGRESQL:-zintrust}
      - DB_PASSWORD_POSTGRESQL=\${DB_PASSWORD_POSTGRESQL:-secret}

      # MySQL
      - DB_PORT_MYSQL=\${DB_PORT_MYSQL:-3306}
      - DB_DATABASE_MYSQL=\${DB_DATABASE_MYSQL:-zintrust}
      - DB_USERNAME_MYSQL=\${DB_USERNAME_MYSQL:-zintrust}
      - DB_PASSWORD_MYSQL=\${DB_PASSWORD_MYSQL:-secret}

    ports:
      - '7772:7772'
`;

const SCRIPT_NAME = 'bin/worker-routes.sh';
const SCRIPT_CONTENT = `#!/bin/bash

# Startup script for Workers API and Queue Monitor
# Usage: ./bin/worker-routes.sh

# Load environment variables if present
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

echo "Starting Workers API (Port 7772)..."
docker-compose -f docker-compose.workers-routes.yml up --build
`;

export const InitContainerWorkersRoutesCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:cwr',
      description: 'Generate docker-compose.workers-routes.yml for Workers API and Queue Monitor',
      async execute(): Promise<void> {
        Logger.info('Initializing container-based worker routes infrastructure...');

        const cwd = process.cwd();
        const composePath = join(cwd, 'docker-compose.workers-routes.yml');
        const scriptPath = join(cwd, SCRIPT_NAME);

        writeFileSync(composePath, DOCKER_COMPOSE_WORKERS_ROUTES_TEMPLATE);
        Logger.info('✅ Generated docker-compose.workers-routes.yml');

        writeFileSync(scriptPath, SCRIPT_CONTENT, { mode: 0o755 });
        Logger.info('✅ Generated ' + SCRIPT_NAME);

        Logger.info('Container worker routes scaffolding complete.');
        Logger.info('Run with: npm run docker:routes');
        await Promise.resolve();
      },
    });
  },
});
