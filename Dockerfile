# Build Stage - Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies (including dev dependencies needed for build)
RUN yarn install --frozen-lockfile

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN yarn build

# Runtime Stage - Production image
FROM node:20-alpine

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy package files for production dependencies
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Copy compiled code from builder stage
COPY --from=builder /app/dist ./dist

# Copy application files
COPY docs ./docs
COPY routes ./routes
COPY config ./config

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/bootstrap.js"]
