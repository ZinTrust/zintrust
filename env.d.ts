declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'testing' | undefined;

    // CLI / process
    HOME?: string | undefined;
    USERPROFILE?: string | undefined;
    PATH?: string | undefined;
    npm_config_scripts_prepend_node_path?: string | undefined;

    APP_MODE?: string | undefined;
    PORT?: string | undefined;
    RUNTIME?: string | undefined;

    // App
    MODE?: string | undefined;
    HOST?: string | undefined;
    APP_NAME?: string | undefined;
    APP_KEY?: string | undefined;
    APP_TIMEZONE?: string | undefined;
    ENVIRONMENT?: string | undefined;
    REQUEST_TIMEOUT?: string | undefined;
    MAX_BODY_SIZE?: string | undefined;
    SHUTDOWN_TIMEOUT?: string | undefined;

    // Database
    DB_CONNECTION?: string | undefined;
    DB_HOST?: string | undefined;
    DB_PORT?: string | undefined;
    DB_DATABASE?: string | undefined;
    DB_USERNAME?: string | undefined;
    DB_PASSWORD?: string | undefined;
    DB_READ_HOSTS?: string | undefined;
    DB_SSL?: string | undefined;
    DB_POOLING?: string | undefined;
    DB_POOL_MIN?: string | undefined;
    DB_POOL_MAX?: string | undefined;
    DB_IDLE_TIMEOUT?: string | undefined;
    DB_CONNECTION_TIMEOUT?: string | undefined;
    DB_LOG_LEVEL?: string | undefined;
    DB_MIGRATION_EXT?: string | undefined;

    // Cloudflare
    D1_DATABASE_ID?: string | undefined;
    KV_NAMESPACE_ID?: string | undefined;

    // Cache
    CACHE_DRIVER?: string | undefined;
    CACHE_KEY_PREFIX?: string | undefined;
    CACHE_FILE_PATH?: string | undefined;
    MEMCACHED_SERVERS?: string | undefined;
    REDIS_HOST?: string | undefined;
    REDIS_PORT?: string | undefined;
    REDIS_PASSWORD?: string | undefined;
    MONGO_URI?: string | undefined;
    MONGO_DB?: string | undefined;

    // Queue
    QUEUE_DRIVER?: string | undefined;
    QUEUE_TABLE?: string | undefined;
    QUEUE_DB_CONNECTION?: string | undefined;
    QUEUE_JOB_TIMEOUT?: string | undefined;
    QUEUE_JOB_RETRIES?: string | undefined;
    QUEUE_JOB_BACKOFF?: string | undefined;
    QUEUE_WORKERS?: string | undefined;
    REDIS_QUEUE_DB?: string | undefined;
    RABBITMQ_HOST?: string | undefined;
    RABBITMQ_PORT?: string | undefined;
    RABBITMQ_USER?: string | undefined;
    RABBITMQ_PASSWORD?: string | undefined;
    RABBITMQ_VHOST?: string | undefined;
    FAILED_JOBS_DB_CONNECTION?: string | undefined;
    FAILED_JOBS_TABLE?: string | undefined;

    // AWS
    AWS_REGION?: string | undefined;
    AWS_ACCESS_KEY_ID?: string | undefined;
    AWS_SECRET_ACCESS_KEY?: string | undefined;
    AWS_SQS_QUEUE_URL?: string | undefined;
    AWS_S3_BUCKET?: string | undefined;
    AWS_S3_URL?: string | undefined;
    AWS_S3_ENDPOINT?: string | undefined;
    AWS_S3_USE_PATH_STYLE_URL?: string | undefined;
    AWS_LAMBDA_FUNCTION_NAME?: string | undefined;
    AWS_LAMBDA_FUNCTION_VERSION?: string | undefined;
    AWS_EXECUTION_ENV?: string | undefined;
    LAMBDA_TASK_ROOT?: string | undefined;

    // GCS
    GCS_PROJECT_ID?: string | undefined;
    GCS_KEY_FILE?: string | undefined;
    GCS_BUCKET?: string | undefined;
    GCS_URL?: string | undefined;

    // Storage
    STORAGE_DRIVER?: string | undefined;
    STORAGE_PATH?: string | undefined;
    STORAGE_URL?: string | undefined;
    STORAGE_VISIBILITY?: string | undefined;
    TEMP_PATH?: string | undefined;
    TEMP_FILE_MAX_AGE?: string | undefined;
    MAX_UPLOAD_SIZE?: string | undefined;
    ALLOWED_UPLOAD_MIMES?: string | undefined;
    UPLOADS_PATH?: string | undefined;
    BACKUPS_PATH?: string | undefined;
    BACKUP_DRIVER?: string | undefined;

    // Microservices
    MICROSERVICES?: string | undefined;
    SERVICES?: string | undefined;
    MICROSERVICES_TRACING?: string | undefined;
    MICROSERVICES_TRACING_RATE?: string | undefined;
    TRACING_EXPORT_INTERVAL?: string | undefined;
    DATABASE_ISOLATION?: string | undefined;
    DATABASE_SCHEMA_PREFIX?: string | undefined;
    SERVICE_DISCOVERY_TYPE?: string | undefined;
    SERVICE_DISCOVERY_REFRESH_INTERVAL?: string | undefined;
    SERVICES_PATH?: string | undefined;
    SERVICE_REGISTRY_HOST?: string | undefined;
    SERVICE_REGISTRY_PORT?: string | undefined;
    SERVICE_DEREGISTER_CRITICAL_AFTER?: string | undefined;
    SERVICE_AUTH_STRATEGY?: string | undefined;
    JAEGER_AGENT_HOST?: string | undefined;
    SERVICE_HEALTH_CHECK_ENABLED?: string | undefined;
    SERVICE_HEALTH_CHECK_INTERVAL?: string | undefined;
    SERVICE_HEALTH_CHECK_TIMEOUT?: string | undefined;
    SERVICE_UNHEALTHY_THRESHOLD?: string | undefined;
    SERVICE_HEALTHY_THRESHOLD?: string | undefined;
    SERVICE_CALL_TIMEOUT?: string | undefined;
    SERVICE_CALL_RETRIES?: string | undefined;
    SERVICE_CALL_RETRY_DELAY?: string | undefined;
    CIRCUIT_BREAKER_ENABLED?: string | undefined;
    CIRCUIT_BREAKER_THRESHOLD?: string | undefined;
    CIRCUIT_BREAKER_TIMEOUT?: string | undefined;
    SERVICE_MESH_ENABLED?: string | undefined;
    SERVICE_MESH_TYPE?: string | undefined;
    SERVICE_MESH_NAMESPACE?: string | undefined;

    // Framework toggles
    DEBUG?: string | undefined;
    ENABLE_MICROSERVICES?: string | undefined;
    TOKEN_TTL?: string | undefined;
    TOKEN_LENGTH?: string | undefined;
    ENABLE_PROFILER?: string | undefined;

    // Startup
    STARTUP_HEALTH_CHECKS?: string | undefined;
    STARTUP_VALIDATE_SECRETS?: string | undefined;
    STARTUP_CHECK_DB?: string | undefined;
    STARTUP_CHECK_CACHE?: string | undefined;
    STARTUP_HEALTH_TIMEOUT_MS?: string | undefined;
    STARTUP_CONTINUE_ON_FAILURE?: string | undefined;

    // Security
    JWT_ENABLED?: string | undefined;
    JWT_SECRET?: string | undefined;
    JWT_ALGORITHM?: string | undefined;
    JWT_EXPIRES_IN?: string | undefined;
    JWT_REFRESH_EXPIRES_IN?: string | undefined;
    JWT_ISSUER?: string | undefined;
    JWT_AUDIENCE?: string | undefined;
    CSRF_ENABLED?: string | undefined;
    CSRF_HEADER_NAME?: string | undefined;
    CSRF_TOKEN_NAME?: string | undefined;
    CSRF_COOKIE_NAME?: string | undefined;
    CSRF_COOKIE_HTTP_ONLY?: string | undefined;
    CSRF_COOKIE_SECURE?: string | undefined;
    CSRF_COOKIE_SAME_SITE?: string | undefined;
    ENCRYPTION_ALGORITHM?: string | undefined;
    ENCRYPTION_KEY?: string | undefined;
    API_KEY_ENABLED?: string | undefined;
    API_KEY_HEADER?: string | undefined;
    API_KEY_SECRET?: string | undefined;
    CORS_ENABLED?: string | undefined;
    CORS_ORIGINS?: string | undefined;
    CORS_METHODS?: string | undefined;
    CORS_ALLOWED_HEADERS?: string | undefined;
    CORS_EXPOSED_HEADERS?: string | undefined;
    RATE_LIMIT_MESSAGE?: string | undefined;
    XSS_REPORT_URI?: string | undefined;
    SESSION_NAME?: string | undefined;
    SESSION_SECRET?: string | undefined;
    SESSION_SAME_SITE?: string | undefined;

    // Logging
    LOG_LEVEL?: string | undefined;
    LOG_FORMAT?: string | undefined;
    DISABLE_LOGGING?: string | undefined;
    LOG_HTTP_REQUEST?: string | undefined;
    LOG_TO_FILE?: string | undefined;
    LOG_ROTATION_SIZE?: string | undefined;
    LOG_ROTATION_DAYS?: string | undefined;

    USE_RAW_QRY: string | undefined;
    SERVICE_API_KEY: string;
    SERVICE_JWT_SECRET: string;
    BASE_URL: string;
    APP_PORT: string;
    ZINTRUST_CLI_DEBUG_ARGS: string;
    LOG_FILE_PATH: string;
  }
}

// Vite-specific ImportMeta interface for import.meta.env
interface ImportMetaEnv {
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly APP_PORT: string;
  readonly NODE_ENV: 'development' | 'production' | 'testing';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
