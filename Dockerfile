# syntax=docker/dockerfile:1.6
# Build Stage - Compile TypeScript
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Reuse npm cache across builds (requires BuildKit)
ENV NPM_CONFIG_CACHE=/root/.npm
ENV NPM_CONFIG_PREFER_OFFLINE=true

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

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

# Build TypeScript to JavaScript
ARG BUILD_VARIANT=full
RUN --mount=type=cache,target=/root/.npm,id=zintrust-npm-cache,sharing=locked npm run build:dk

# Runtime Stage - Production image
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7772
ENV HOST=0.0.0.0

# Create non-root user for security
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin nodejs

# Copy package files for production dependencies
COPY package.json package-lock.json ./

# Install only production dependencies (requires build tools for native modules)
RUN --mount=type=cache,target=/root/.npm,id=zintrust-npm-cache,sharing=locked \
  apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Copy compiled code from builder stage
COPY --from=builder /app/dist ./dist


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
