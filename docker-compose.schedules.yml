name: zintrust-schedules

services:
  schedules:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      SCHEDULES_ENABLED: ${SCHEDULES_ENABLED:-true}
      CSRF_SKIP_PATHS: ${CSRF_SKIP_PATHS:-/api/*,/queue-monitor/*}

      # Scheduling
      SCHEDULE_SHUTDOWN_TIMEOUT_MS: ${SCHEDULE_SHUTDOWN_TIMEOUT_MS:-30000}
      SCHEDULE_OVERLAP_LOCK_TTL_MS: ${SCHEDULE_OVERLAP_LOCK_TTL_MS:-300000}

      # Redis (for locks / queue / cache)
      REDIS_HOST: ${REDIS_HOST:-redis}
      REDIS_PORT: ${REDIS_PORT:-6379}
      REDIS_PASSWORD: ${REDIS_PASSWORD:-}
      REDIS_DB: ${REDIS_DB:-0}

      # Database (for job-tracking cleanup schedule)
      DB_CONNECTION: ${DB_CONNECTION:-postgresql}
      DB_HOST: ${DB_HOST:-postgres}
      DB_PORT: ${DB_PORT:-5432}
      DB_DATABASE: ${DB_DATABASE:-zintrust}
      DB_USERNAME: ${DB_USERNAME:-zintrust}
      DB_PASSWORD: ${DB_PASSWORD:-zintrust}

      # Job tracking cleanup schedule
      JOB_TRACKING_CLEANUP_ENABLED: ${JOB_TRACKING_CLEANUP_ENABLED:-false}
      JOB_TRACKING_CLEANUP_INTERVAL_MS: ${JOB_TRACKING_CLEANUP_INTERVAL_MS:-21600000}
      JOB_TRACKING_CLEANUP_RETENTION_DAYS: ${JOB_TRACKING_CLEANUP_RETENTION_DAYS:-30}
      JOB_TRACKING_CLEANUP_BATCH_SIZE: ${JOB_TRACKING_CLEANUP_BATCH_SIZE:-5000}
      JOB_TRACKING_CLEANUP_MAX_BATCHES: ${JOB_TRACKING_CLEANUP_MAX_BATCHES:-1}
      JOB_TRACKING_CLEANUP_LOCK_PROVIDER: ${JOB_TRACKING_CLEANUP_LOCK_PROVIDER:-redis}
    command: ['node', 'dist/bin/zin.js', 'schedule:start']
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - zintrust-network

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_DATABASE:-zintrust}
      POSTGRES_USER: ${DB_USERNAME:-zintrust}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-zintrust}
    ports:
      - '${POSTGRES_PORT:-5432}:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME:-zintrust}']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - zintrust-network

  redis:
    image: redis:7-alpine
    ports:
      - '${REDIS_PORT:-6379}:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - zintrust-network

networks:
  zintrust-network:

volumes:
  postgres_data:
  redis_data:
