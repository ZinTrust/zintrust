import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { existsSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

const DOCKER_COMPOSE_WORKERS_TEMPLATE = `services:
  # BullMQ Workers (Consumer)
  workers:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - RUNTIME_MODE=containers
      - WORKER_ENABLED=true
      - WORKER_AUTO_START=true
      - QUEUE_ENABLED=true
      # Redis (defaults to host, override in .env for external)
      - REDIS_HOST=\${REDIS_HOST:-host.docker.internal}
      - REDIS_PORT=\${REDIS_PORT:-6379}
      - REDIS_PASSWORD=\${REDIS_PASSWORD}
      # Database Driver Selection (Connects to host DB via host.docker.internal or external IP)
      - DB_CONNECTION=\${DB_CONNECTION:-postgres}
      - DB_HOST=\${DB_HOST:-host.docker.internal}
      # PostgreSQL
      - DB_PORT_POSTGRESQL=\${DB_PORT_POSTGRESQL:-5432}
      - DB_DATABASE_POSTGRESQL=\${DB_DATABASE_POSTGRESQL:-zintrust}
      - DB_USERNAME_POSTGRESQL=\${DB_USERNAME_POSTGRESQL:-zintrust}
      - DB_PASSWORD_POSTGRESQL=\${DB_PASSWORD_POSTGRESQL:-secret}
      # MySQL
      - DB_PORT=\${DB_PORT:-3306}
      - DB_DATABASE=\${DB_DATABASE:-zintrust}
      - DB_USERNAME=\${DB_USERNAME:-zintrust}
      - DB_PASSWORD=\${DB_PASSWORD:-secret}
      # SQL Server
      - DB_HOST_SQLSERVER=\${DB_HOST_SQLSERVER:-host.docker.internal}
      - DB_PORT_SQLSERVER=\${DB_PORT_SQLSERVER:-1433}
      - DB_DATABASE_SQLSERVER=\${DB_DATABASE_SQLSERVER:-zintrust}
      - DB_USERNAME_SQLSERVER=\${DB_USERNAME_SQLSERVER:-sa}
      - DB_PASSWORD_SQLSERVER=\${DB_PASSWORD_SQLSERVER:-YourStrong@Passw0rd}
      # SQLite
      - DB_DATABASE_SQLITE=\${DB_DATABASE_SQLITE:-/app/data/zintrust.db}
      # Cloudflare D1 Proxy
      - D1_PROXY_URL=\${D1_PROXY_URL}
      - D1_DATABASE_ID=\${D1_DATABASE_ID}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    command: ['node', 'dist/bin/zin.js', 'worker:start-all']
    deploy:
      replicas: 2
      restart_policy:
        condition: any

`;

const DOCKERFILE_TEMPLATE = String.raw`# Build Stage - Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy source code using COPY . . to handle optional folders automatically
COPY . .

# Build TypeScript to JavaScript (Docker build includes packages)
RUN npm run build:dk

# Runtime Stage - Production image
FROM node:20-alpine AS runtime

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7772
ENV HOST=0.0.0.0

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package files for production dependencies
COPY package.json package-lock.json ./

# Install only production dependencies (requires build tools for native modules)
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps \
    && npm cache clean --force

# Copy compiled code from builder stage
COPY --from=builder /app/dist ./dist

# Copy compiled application folders to root as expected by Application.ts
COPY --from=builder /app/dist/app ./app
COPY --from=builder /app/dist/routes ./routes
COPY --from=builder /app/dist/src/config ./config
# Use a wildcard to avoid error if database folder is empty/missing
COPY --from=builder /app/dist/src/databas* ./database/


# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:7772/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 7772

# Start application (compiled JS; no tsx needed in runtime)
CMD ["node", "dist/src/boot/bootstrap.js"]
`;

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
    writeFileSync(composePath, DOCKER_COMPOSE_WORKERS_TEMPLATE);
    Logger.info('✅ Created docker-compose.workers.yml');
  } else {
    Logger.info('Skipped docker-compose.workers.yml');
  }
}

async function writeDockerfile(cwd: string): Promise<void> {
  const dockerfilePath = join(cwd, 'Dockerfile');

  let shouldWrite = true;
  if (existsSync(dockerfilePath)) {
    // Only ask if it's different or just generic confirm? Let's just ask.
    shouldWrite = await PromptHelper.confirm(
      'Dockerfile already exists. Overwrite with standard worker configuration?',
      false
    );
  }

  if (shouldWrite) {
    writeFileSync(dockerfilePath, DOCKERFILE_TEMPLATE);
    Logger.info('✅ Created Dockerfile');
  } else {
    Logger.info('Skipped Dockerfile');
  }
}

export const InitContainerCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:container-workers',
      aliases: ['init:cw'],
      description: 'Initialize container-based worker infrastructure',
      async execute(): Promise<void> {
        Logger.info('Initializing container-based worker infrastructure...');

        const cwd = process.cwd();
        await writeDockerComposeFile(cwd);
        await writeDockerfile(cwd);

        Logger.info('✅ Container worker scaffolding complete.');
        Logger.info('Run with: docker-compose -f docker-compose.workers.yml up');
        await Promise.resolve();
      },
    });
  },
});
