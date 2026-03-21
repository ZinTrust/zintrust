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

FROM builder AS runtime-artifacts

RUN set -eu; \
  runtime_root=/runtime-root; \
  mkdir -p "$runtime_root/dist/packages"; \
  cp -R /app/dist/. "$runtime_root/dist/"; \
  for package in \
    db-postgres \
    db-mysql \
    db-sqlserver \
    db-sqlite \
    queue-redis \
    queue-rabbitmq \
    queue-sqs \
    cache-redis \
    cache-mongodb \
    mail-nodemailer \
    mail-smtp \
    mail-sendgrid \
    mail-mailgun \
    storage-s3 \
    storage-r2 \
    storage-gcs; do \
    mkdir -p "$runtime_root/dist/packages/$package"; \
    cp -R "/app/packages/$package/dist" "$runtime_root/dist/packages/$package/dist"; \
  done

FROM runtime-artifacts AS worker-artifacts

RUN set -eu; \
  for package in workers queue-monitor; do \
    mkdir -p "/runtime-root/dist/packages/$package"; \
    cp -R "/app/packages/$package/dist" "/runtime-root/dist/packages/$package/dist"; \
  done

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

# Copy the fresh-start runtime payload from the builder in one place.
COPY --from=runtime-artifacts --chown=nodejs:nodejs /runtime-root/ /app/

RUN rm -rf /app/node_modules/@zintrust/core \
  && mkdir -p /app/node_modules/@zintrust \
  && ln -s ../../dist /app/node_modules/@zintrust/core \
  && chown -h nodejs:nodejs /app/node_modules/@zintrust/core

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

COPY --from=worker-artifacts --chown=nodejs:nodejs /runtime-root/ /app/

ENV DOCKER_WORKER=true
ENV WORKER_ENABLED=true
ENV WORKER_AUTO_START=true
ENV QUEUE_ENABLED=true
ENV PORT=0

HEALTHCHECK NONE

CMD ["node", "dist/bin/zin.js", "worker:start-all"]
