# syntax=docker/dockerfile:1.6
# Build Stage - Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Reuse npm cache across builds (requires BuildKit)
ENV NPM_CONFIG_CACHE=/root/.npm
ENV NPM_CONFIG_PREFER_OFFLINE=true

# Reuse npm cache across builds (requires BuildKit)
ENV NPM_CONFIG_CACHE=/root/.npm
ENV NPM_CONFIG_PREFER_OFFLINE=true

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies needed for build)
RUN --mount=type=cache,target=/root/.npm \
  npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
   && npm ci

# Copy source code using COPY . . to handle optional folders automatically
COPY . .

# Build TypeScript to JavaScript
ARG BUILD_VARIANT=full
RUN --mount=type=cache,target=/root/.npm npm run build:dk

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
RUN --mount=type=cache,target=/root/.npm \
  apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
    && apk del .build-deps \
    && npm cache clean --force

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
