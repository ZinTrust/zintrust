# syntax=docker/dockerfile:1.6
# Build Stage - Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Reuse npm cache across builds (requires BuildKit)
ENV NPM_CONFIG_CACHE=/root/.npm
ENV NPM_CONFIG_PREFER_OFFLINE=true

# Upgrade Alpine base packages first so OS-level security fixes land in the image.
RUN apk upgrade --no-cache \
  && apk add --no-cache g++ git make python3

# Patch npm (base image includes npm 10.x with vulnerable bundled deps)
ARG NPM_VERSION=11.10.0
ARG NPM_TAR_VERSION=7.5.8
RUN npm i -g "npm@${NPM_VERSION}" \
  && mkdir -p /tmp/npm-tar-patch \
  && cd /tmp/npm-tar-patch \
  && npm pack "tar@${NPM_TAR_VERSION}" \
  && tar -xzf "tar-${NPM_TAR_VERSION}.tgz" \
  && rm -rf /usr/local/lib/node_modules/npm/node_modules/tar \
  && mv package /usr/local/lib/node_modules/npm/node_modules/tar \
  && rm -rf /tmp/npm-tar-patch

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies needed for build)
RUN --mount=type=cache,target=/root/.npm,id=zintrust-npm-cache,sharing=locked \
  npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
   && npm ci

# Copy source code using COPY . . to handle optional folders automatically
COPY . .

# Build TypeScript to JavaScript and package-local plugin bundles
ARG BUILD_VARIANT=full
RUN --mount=type=cache,target=/root/.npm,id=zintrust-npm-cache,sharing=locked npm run build:dk

# Runtime Stage - Production image
FROM node:20-alpine AS runtime

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7772
ENV HOST=0.0.0.0

# Create non-root user for security
RUN apk upgrade --no-cache \
  && addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S -G nodejs nodejs

# Patch npm (base image includes npm 10.x with vulnerable bundled deps)
ARG NPM_VERSION=11.10.0
ARG NPM_TAR_VERSION=7.5.8
RUN npm i -g "npm@${NPM_VERSION}" \
  && mkdir -p /tmp/npm-tar-patch \
  && cd /tmp/npm-tar-patch \
  && npm pack "tar@${NPM_TAR_VERSION}" \
  && tar -xzf "tar-${NPM_TAR_VERSION}.tgz" \
  && rm -rf /usr/local/lib/node_modules/npm/node_modules/tar \
  && mv package /usr/local/lib/node_modules/npm/node_modules/tar \
  && rm -rf /tmp/npm-tar-patch

# Copy package files for production dependencies
COPY package.json package-lock.json ./

# Install only production dependencies (requires build tools for native modules)
RUN --mount=type=cache,target=/root/.npm,id=zintrust-npm-cache,sharing=locked \
  apk add --no-cache --virtual .build-deps g++ make python3 \
  && npm ci --omit=dev \
  && npm cache clean --force \
  && apk del .build-deps \
  && find /root/.npm -mindepth 1 -delete \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

# Copy compiled code from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/db-postgres ./dist/packages/db-postgres
COPY --from=builder /app/packages/db-mysql ./dist/packages/db-mysql
COPY --from=builder /app/packages/db-sqlserver ./dist/packages/db-sqlserver
COPY --from=builder /app/packages/db-sqlite ./dist/packages/db-sqlite
COPY --from=builder /app/packages/queue-redis ./dist/packages/queue-redis
COPY --from=builder /app/packages/queue-rabbitmq ./dist/packages/queue-rabbitmq
COPY --from=builder /app/packages/queue-sqs ./dist/packages/queue-sqs
COPY --from=builder /app/packages/cache-redis ./dist/packages/cache-redis
COPY --from=builder /app/packages/cache-mongodb ./dist/packages/cache-mongodb
COPY --from=builder /app/packages/mail-nodemailer ./dist/packages/mail-nodemailer
COPY --from=builder /app/packages/mail-smtp ./dist/packages/mail-smtp
COPY --from=builder /app/packages/mail-sendgrid ./dist/packages/mail-sendgrid
COPY --from=builder /app/packages/mail-mailgun ./dist/packages/mail-mailgun
COPY --from=builder /app/packages/storage-s3 ./dist/packages/storage-s3
COPY --from=builder /app/packages/storage-r2 ./dist/packages/storage-r2
COPY --from=builder /app/packages/storage-gcs ./dist/packages/storage-gcs


# Expose the built framework package to official plugin packages loaded from dist/packages.
RUN mkdir -p /app/node_modules/@zintrust \
  && rm -rf /app/node_modules/@zintrust/core \
  && ln -s ../../dist /app/node_modules/@zintrust/core \
  && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:7772/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose ports
# - 7772: default app server port for this image
# - 8789-8794: Cloudflare Containers proxy ports (MySQL/Postgres/Redis/MongoDB/SQLServer/SMTP)
EXPOSE 7772 8789 8790 8791 8792 8793 8794

# Start application (compiled JS; no tsx needed in runtime)
CMD ["node", "dist/src/boot/bootstrap.js"]

FROM runtime AS worker

COPY --from=builder /app/packages/workers ./dist/packages/workers
COPY --from=builder /app/packages/queue-monitor ./dist/packages/queue-monitor

ENV DOCKER_WORKER=true
ENV WORKER_ENABLED=true
ENV WORKER_AUTO_START=true
ENV QUEUE_ENABLED=true
ENV PORT=0

HEALTHCHECK NONE

CMD ["node", "dist/bin/zin.js", "worker:start-all"]
