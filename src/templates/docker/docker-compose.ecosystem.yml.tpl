name: zintrust-ecosystem

x-app-runtime: &app-runtime
  build:
    context: .
    dockerfile: Dockerfile

x-common-env: &common-env
  NODE_ENV: ${NODE_ENV:-development}
  CSRF_SKIP_PATHS: ${CSRF_SKIP_PATHS:-/api/*,/queue-monitor/*}

  SCHEDULE_SHUTDOWN_TIMEOUT_MS: ${SCHEDULE_SHUTDOWN_TIMEOUT_MS:-30000}
  SCHEDULE_OVERLAP_LOCK_TTL_MS: ${SCHEDULE_OVERLAP_LOCK_TTL_MS:-300000}

  # Database & Redis
  DB_CONNECTION: ${DB_CONNECTION:-postgresql}
  DB_HOST: ${DB_HOST:-postgres}
  DB_PORT: ${DB_PORT:-5432}
  DB_DATABASE: ${DB_DATABASE:-zintrust}
  DB_USERNAME: ${DB_USERNAME:-zintrust}
  DB_PASSWORD: ${DB_PASSWORD:-zintrust}

  REDIS_HOST: ${REDIS_HOST:-redis}
  REDIS_PORT: ${REDIS_PORT:-6379}
  REDIS_PASSWORD: ${REDIS_PASSWORD:-}
  REDIS_DB: ${REDIS_DB:-0}

services:
  # Web Application (API)
  web:
    <<: *app-runtime
    ports:
      - '${PORT:-3000}:3000'
    environment:
      <<: *common-env
      PORT: 3000
      HOST: 0.0.0.0
      RUNTIME_MODE: node-server
      WORKER_ENABLED: 'false'
      QUEUE_ENABLED: 'true'
    command: npm run dev
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
      - /app/dist
    networks:
      - zintrust-network

  # Workers (Consumers)
  workers:
    <<: *app-runtime
    environment:
      <<: *common-env
      RUNTIME_MODE: containers
      WORKER_ENABLED: 'true'
      WORKER_AUTO_START: 'true'
      QUEUE_ENABLED: 'true'
    command: npx tsx bin/zin.ts worker:start-all
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
      - /app/dist
    networks:
      - zintrust-network

  # Dedicated schedules service (auto-start schedules)
  schedules:
    <<: *app-runtime
    environment:
      <<: *common-env
      # Dedicated schedules service enabled by default (override in .env)
      SCHEDULES_ENABLED: ${SCHEDULES_ENABLED:-true}
      # job tracking cleanup schedule
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

  # Backing services
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

  # Proxies (optional; separate blocks like docker-compose.proxy.yml)
  # These can be started/stopped independently.
  proxy-gateway:
    image: ${PROXY_GATEWAY_IMAGE:-zintrust-proxy-gateway:local}
    build:
      context: ./docker/proxy-gateway
      dockerfile: Dockerfile
    restart: on-failure:3
    depends_on:
      - proxy-mysql
      - proxy-pg
      - proxy-redis
      - proxy-mongodb
      - proxy-sqlserver
      - proxy-smtp
    ports:
      - ${PROXY_GATEWAY_PORT:-8800}:8080
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      CSRF_SKIP_PATHS: ${CSRF_SKIP_PATHS:-/api/*,/queue-monitor/*}
    networks:
      - zintrust-network

  proxy-mysql:
    image: ${PROXY_IMAGE:-zintrust-proxy:local}
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:mysql', '--host', '0.0.0.0', '--port', '8789']
    expose:
      - '8789'
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      APP_NAME: ${APP_NAME:-ZinTrust}
      APP_KEY: ${APP_KEY:-}
      MYSQL_PROXY_REQUIRE_SIGNING: true
      MYSQL_PROXY_KEY_ID: ${MYSQL_PROXY_KEY_ID:-}
      MYSQL_PROXY_SECRET: ${MYSQL_PROXY_SECRET:-}
      MYSQL_PROXY_SIGNING_WINDOW_MS: ${MYSQL_PROXY_SIGNING_WINDOW_MS:-60000}
      MYSQL_DB_HOST: ${MYSQL_DB_HOST:-${DOCKER_DB_HOST:-host.docker.internal}}
      MYSQL_DB_PORT: ${MYSQL_DB_PORT:-${DB_PORT:-3306}}
      MYSQL_DB_DATABASE: ${MYSQL_DB_DATABASE:-${DB_DATABASE:-zintrust}}
      MYSQL_DB_USERNAME: ${MYSQL_DB_USERNAME:-${DB_USERNAME:-zintrust}}
      MYSQL_DB_PASSWORD: ${MYSQL_DB_PASSWORD:-${DB_PASSWORD:-secret}}
    networks:
      - zintrust-network

  proxy-pg:
    image: ${PROXY_IMAGE:-zintrust-proxy:local}
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:postgres', '--host', '0.0.0.0', '--port', '8790']
    expose:
      - '8790'
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      APP_NAME: ${APP_NAME:-ZinTrust}
      APP_KEY: ${APP_KEY:-}
      POSTGRES_PROXY_REQUIRE_SIGNING: true
      POSTGRES_PROXY_KEY_ID: ${POSTGRES_PROXY_KEY_ID:-}
      POSTGRES_PROXY_SECRET: ${POSTGRES_PROXY_SECRET:-}
      POSTGRES_PROXY_SIGNING_WINDOW_MS: ${POSTGRES_PROXY_SIGNING_WINDOW_MS:-60000}
      DB_HOST: ${DOCKER_DB_HOST:-host.docker.internal}
      DB_PORT_POSTGRESQL: ${POSTGRES_DB_PORT:-5432}
      DB_DATABASE_POSTGRESQL: ${POSTGRES_DB_DATABASE:-postgres}
      DB_USERNAME_POSTGRESQL: ${POSTGRES_DB_USERNAME:-postgres}
      DB_PASSWORD_POSTGRESQL: ${POSTGRES_DB_PASSWORD:-postgres}
    networks:
      - zintrust-network

  proxy-redis:
    image: ${PROXY_IMAGE:-zintrust-proxy:local}
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:redis', '--host', '0.0.0.0', '--port', '8791']
    expose:
      - '8791'
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      APP_NAME: ${APP_NAME:-ZinTrust}
      APP_KEY: ${APP_KEY:-}
      REDIS_PROXY_REQUIRE_SIGNING: true
      REDIS_PROXY_KEY_ID: ${REDIS_PROXY_KEY_ID:-}
      REDIS_PROXY_SECRET: ${REDIS_PROXY_SECRET:-}
      REDIS_PROXY_SIGNING_WINDOW_MS: ${REDIS_PROXY_SIGNING_WINDOW_MS:-60000}
      REDIS_PROXY_TARGET_HOST: ${REDIS_PROXY_TARGET_HOST:-${DOCKER_REDIS_HOST:-host.docker.internal}}
      REDIS_PROXY_TARGET_PORT: ${REDIS_PROXY_TARGET_PORT:-${REDIS_PORT:-6379}}
      REDIS_PROXY_TARGET_PASSWORD: ${REDIS_PROXY_TARGET_PASSWORD:-${REDIS_PASSWORD:-}}
      REDIS_PROXY_TARGET_DB: ${REDIS_PROXY_TARGET_DB:-${REDIS_DB:-0}}
    networks:
      - zintrust-network

  proxy-mongodb:
    image: ${PROXY_IMAGE:-zintrust-proxy:local}
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:mongodb', '--host', '0.0.0.0', '--port', '8792']
    expose:
      - '8792'
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      APP_NAME: ${APP_NAME:-ZinTrust}
      APP_KEY: ${APP_KEY:-}
      MONGODB_PROXY_REQUIRE_SIGNING: true
      MONGODB_PROXY_KEY_ID: ${MONGODB_PROXY_KEY_ID:-}
      MONGODB_PROXY_SECRET: ${MONGODB_PROXY_SECRET:-}
      MONGODB_PROXY_SIGNING_WINDOW_MS: ${MONGODB_PROXY_SIGNING_WINDOW_MS:-60000}
      MONGO_URI: ${MONGODB_PROXY_TARGET_URI:-mongodb://host.docker.internal:27017}
      MONGO_DB: ${MONGODB_PROXY_TARGET_DB:-zintrust}
    networks:
      - zintrust-network

  proxy-sqlserver:
    image: ${PROXY_IMAGE:-zintrust-proxy:local}
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:sqlserver', '--host', '0.0.0.0', '--port', '8793']
    expose:
      - '8793'
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      APP_NAME: ${APP_NAME:-ZinTrust}
      APP_KEY: ${APP_KEY:-}
      SQLSERVER_PROXY_REQUIRE_SIGNING: true
      SQLSERVER_PROXY_KEY_ID: ${SQLSERVER_PROXY_KEY_ID:-}
      SQLSERVER_PROXY_SECRET: ${SQLSERVER_PROXY_SECRET:-}
      SQLSERVER_PROXY_SIGNING_WINDOW_MS: ${SQLSERVER_PROXY_SIGNING_WINDOW_MS:-60000}
      DB_HOST_MSSQL: ${SQLSERVER_DB_HOST:-host.docker.internal}
      DB_PORT_MSSQL: ${SQLSERVER_DB_PORT:-1433}
      DB_DATABASE_MSSQL: ${SQLSERVER_DB_DATABASE:-zintrust}
      DB_USERNAME_MSSQL: ${SQLSERVER_DB_USERNAME:-sa}
      DB_PASSWORD_MSSQL: ${SQLSERVER_DB_PASSWORD:-}
    networks:
      - zintrust-network

  proxy-smtp:
    image: ${PROXY_IMAGE:-zintrust-proxy:local}
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:smtp', '--host', '0.0.0.0', '--port', '8794']
    expose:
      - '8794'
    environment:
      NODE_ENV: ${NODE_ENV:-development}
      APP_NAME: ${APP_NAME:-ZinTrust}
      APP_KEY: ${APP_KEY:-}
      SMTP_PROXY_REQUIRE_SIGNING: true
      SMTP_PROXY_KEY_ID: ${SMTP_PROXY_KEY_ID:-}
      SMTP_PROXY_SECRET: ${SMTP_PROXY_SECRET:-}
      SMTP_PROXY_SIGNING_WINDOW_MS: ${SMTP_PROXY_SIGNING_WINDOW_MS:-60000}
    networks:
      - zintrust-network

networks:
  zintrust-network:

volumes:
  postgres_data:
  redis_data:
