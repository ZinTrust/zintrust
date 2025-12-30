# Build Stage - Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src
COPY app ./app
COPY routes ./routes
COPY bin ./bin

# Build TypeScript to JavaScript
RUN npm run build

# Runtime Stage - Production image
FROM node:20-alpine AS runtime

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
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
  CMD node -e "require('node:http').get('http://localhost:7777/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3000

# Start application
CMD ["npx", "tsx", "dist/src/bootstrap.js"]
