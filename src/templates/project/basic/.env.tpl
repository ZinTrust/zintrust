# ============================================================================
# Zintrust Framework - Environment Configuration
# Generated from src/config/env.ts - All available configuration keys
# ============================================================================

# ============================================================================
# APPLICATION
# ============================================================================

# Environment: development | staging | production
NODE_ENV=development

# Server Configuration
HOST=127.0.0.1
APP_PORT=7777
APP_NAME={{projectName}}
APP_KEY=


# ============================================================================
# LOGGING
# ============================================================================

# Log Level: debug | info | warn | error
LOG_LEVEL=debug
DISABLE_LOGGING=true
LOG_CHANNEL=file


# ============================================================================
# DATABASE
# ============================================================================

# Database Connection Driver
# Options: sqlite | postgresql | mysql | sqlserver | d1
DB_CONNECTION=sqlite

# SQLite Configuration
DB_PATH=./storage/db.sqlite

# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=zintrust
DB_USERNAME=postgres
DB_PASSWORD=
DB_READ_HOSTS=

# ============================================================================
# CLOUDFLARE
# ============================================================================

D1_DATABASE_ID=
KV_NAMESPACE_ID=

# ============================================================================
# CACHE
# ============================================================================

# Cache Driver: memory | redis | memcached
CACHE_DRIVER=memory

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MongoDB Cache Configuration
MONGO_URI=
MONGO_DB=zintrust_cache

# ============================================================================
# AWS
# ============================================================================

AWS_REGION=us-east-1
AWS_LAMBDA_FUNCTION_NAME=
AWS_LAMBDA_FUNCTION_VERSION=
AWS_EXECUTION_ENV=
LAMBDA_TASK_ROOT=

# ============================================================================
# MICROSERVICES
# ============================================================================

MICROSERVICES=
SERVICES=
MICROSERVICES_TRACING=false
MICROSERVICES_TRACING_RATE=1.0
DATABASE_ISOLATION=shared
SERVICE_API_KEY=
SERVICE_JWT_SECRET=

# ============================================================================
# SECURITY
# ============================================================================

DEBUG=false
ENABLE_MICROSERVICES=false
TOKEN_TTL=3600000
TOKEN_LENGTH=32

# JWT Secret for authentication
JWT_SECRET=

# Session Configuration
SESSION_DRIVER=cookie
SESSION_LIFETIME=7200

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# ============================================================================
# DEPLOYMENT
# ============================================================================

ENVIRONMENT=development
REQUEST_TIMEOUT=30000
MAX_BODY_SIZE=10485760


# ============================================================================
# EXTERNAL SERVICES & CREDENTIALS
# ============================================================================

SONAR_ORGANIZATION="zintrust"
SONAR_PROJECT_ID="ZinTrust_ZinTrust"
SONAR_HOST_URL="https://sonarcloud.io"
SONAR_TOKEN=

# Cloudflare Workspace-Specific Credentials
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=""

CODECOV_TOKEN=

# Security Scanning
SNYK_TOKEN=

# Email (SendGrid)
SENDGRID_API_KEY=

# Payments (Stripe)
STRIPE_SECRET_KEY=
STRIPE_PUBLIC_KEY=

# Cloud Storage (AWS S3)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET=

# ============================================================================
# DEVELOPMENT
# ============================================================================

# Database Synchronization (auto-migrate on startup)
DB_SYNCHRONIZE=true

# Database Logging
DB_LOGGING=false

# Raw SQL Query Support (development only)
# WARNING: Only enable in development. Bypasses QueryBuilder safety.
USE_RAW_QRY=false
