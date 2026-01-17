# ZinTrust Framework - Environment Configuration
# Copy this file to .env and configure for your environment

# ============================================================================
# APPLICATION
# ============================================================================

# Environment: development | staging | production
NODE_ENV=development

# Application Name
APP_NAME=Zintrust App

# Server Configuration
HOST=
PORT=

# Application Encryption Key (base64 required for production)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Used for: encryption, CSRF tokens, session tokens, API keys
APP_KEY=

# ============================================================================
# DATABASE
# ============================================================================

# Database Connection Driver
# Options: sqlite | postgresql | mysql | sqlserver | d1
DB_CONNECTION=

# SQLite (default for development)
DB_PATH=

# PostgreSQL
# DB_HOST=localhost
# DB_PORT=5432
# DB_DATABASE=zintrust
# DB_USERNAME=postgres
# DB_PASSWORD=postgres

# MySQL
# DB_HOST=localhost
# DB_PORT=3306
# DB_DATABASE=zintrust
# DB_USERNAME=root
# DB_PASSWORD=password

# SQL Server
# DB_HOST=localhost
# DB_PORT=1433
# DB_DATABASE=zintrust
# DB_USERNAME=sa
# DB_PASSWORD=Password123

# ============================================================================
# ADVANCED DATABASE FEATURES
# ============================================================================

# Raw SQL Query Support
# WARNING: Only enable in development. Bypasses QueryBuilder safety.
# This is checked once at application bootstrap, cached in memory.
# Feature flag is initialized at startup - no runtime changes possible.
USE_RAW_QRY=

# ============================================================================
# CACHE
# ============================================================================

# Cache Driver: memory | redis | mongodb | kv
# - kv: Cloudflare Workers only (requires a KV binding named "CACHE")
CACHE_DRIVER=

# Redis Configuration (if using Redis)
# REDIS_HOST=localhost
# REDIS_PORT=6379

# MongoDB Cache (if using mongodb)
# Uses MongoDB Atlas Data API (HTTPS)
# MONGO_URI=https://data.mongodb-api.com/app/<app-id>/endpoint/data/v1
# MONGO_DB=zintrust_cache

# ============================================================================
# LOGGING
# ============================================================================

# Log Level: debug | info | warn | error
LOG_LEVEL=

# Log Channel: console | file | all
LOG_CHANNEL=

# ============================================================================
# SECURITY
# ============================================================================

# JWT Secret for authentication
JWT_SECRET=

# Session Configuration
SESSION_DRIVER=
SESSION_LIFETIME=

# CORS Configuration
CORS_ORIGINS=

# ============================================================================
# MICROSERVICES
# ============================================================================

# Enable Microservices
MICROSERVICES=

# Comma-separated list of services to load
SERVICES=

# Service Discovery
SERVICE_DISCOVERY=

# Request Tracing
MICROSERVICES_TRACING=
MICROSERVICES_TRACING_RATE=

# ============================================================================
# SONARQUBE / SONARCLOUD
# ============================================================================

# SonarQube Server
SONAR_HOST_URL=

# SonarCloud
# SONAR_HOST_URL=https://sonarcloud.io
# SONAR_TOKEN=your_token
# SONAR_ORGANIZATION=your-organization

# ============================================================================
# EXTERNAL SERVICES
# ============================================================================

# Snyk Security Token
# SNYK_TOKEN=your_token

# SendGrid (Email)
# SENDGRID_API_KEY=your_api_key

# Stripe (Payments)
# STRIPE_SECRET_KEY=your_secret_key
# STRIPE_PUBLIC_KEY=your_public_key

# AWS S3 (File Storage)
# AWS_ACCESS_KEY_ID=your_access_key
# AWS_SECRET_ACCESS_KEY=your_secret_key
# AWS_REGION=us-east-1
# AWS_BUCKET=your_bucket_name

# ============================================================================
# DEVELOPMENT
# ============================================================================

# Debug Mode
DEBUG=

# Database Synchronization (auto-migrate on startup)
DB_SYNCHRONIZE=

# Database Logging
DB_LOGGING=
