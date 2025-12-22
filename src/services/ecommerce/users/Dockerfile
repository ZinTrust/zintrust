# Multi-stage build for microservice
# Target: < 1 MB final image

# Stage 1: Build
FROM node:20-alpine@sha256:fcbb8f7d018707c656a4da2eea8a15f2893d2258093fea9ff2ea5ea1cba82112 AS builder

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy source code
COPY services/ecommerce/users/src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build 2>/dev/null || true

# Stage 2: Runtime
FROM node:20-alpine@sha256:fcbb8f7d018707c656a4da2eea8a15f2893d2258093fea9ff2ea5ea1cba82112

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built artifacts from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist

# Copy package.json only
COPY package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Set environment
ENV NODE_ENV=production
ENV SERVICE_NAME=users
ENV SERVICE_PORT=3001

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start service
CMD ["node", "dist/src/Kernel.js"]
