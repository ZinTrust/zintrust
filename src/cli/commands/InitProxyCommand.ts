import { BaseCommand, type IBaseCommand } from '@cli/BaseCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { existsSync, mkdirSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';

const DOCKER_COMPOSE_PROXY_TEMPLATE = `name: zintrust-proxies

x-proxy-runtime: &proxy-runtime
  image: \\${PROXY_IMAGE:-zintrust-proxy:local}
  build:
    context: .
    dockerfile: Dockerfile
    target: runtime
  restart: always
  ulimits:
    nofile:
      soft: 65535
      hard: 65535
  environment:
    NODE_ENV: \\${NODE_ENV:-production}
    APP_NAME: \\${APP_NAME:-ZinTrust}
    APP_KEY: \\${APP_KEY:-}
  networks:
    - zintrust-proxy-network

services:
  proxy-gateway:
    image: nginx:1.27-alpine
    restart: always
    ulimits:
      nofile:
        soft: 200000
        hard: 200000
    depends_on:
      - proxy-mysql
      - proxy-pg
      - proxy-redis
      - proxy-mongodb
      - proxy-sqlserver
      - proxy-smtp
    ports:
      - \\${PROXY_GATEWAY_PORT:-8800}:8080
    volumes:
      - ./docker/proxy-gateway/nginx.conf:/etc/nginx/nginx.conf:ro
    healthcheck:
      test: ['CMD-SHELL', 'wget -q -O /dev/null http://127.0.0.1:8080/health']
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - zintrust-proxy-network

  proxy-mysql:
    <<: *proxy-runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:mysql', '--host', '0.0.0.0', '--port', '8789']
    expose:
      - '8789'
    environment:
      APP_NAME: \\${APP_NAME:-ZinTrust}
      APP_KEY: \\${APP_KEY:-}
      MYSQL_PROXY_REQUIRE_SIGNING: \\${MYSQL_PROXY_REQUIRE_SIGNING:-true}
      MYSQL_PROXY_KEY_ID: \\${MYSQL_PROXY_KEY_ID:-}
      MYSQL_PROXY_SECRET: \\${MYSQL_PROXY_SECRET:-}
      MYSQL_PROXY_SIGNING_WINDOW_MS: \\${MYSQL_PROXY_SIGNING_WINDOW_MS:-60000}
      DB_HOST: \\${MYSQL_DB_HOST:-host.docker.internal}
      DB_PORT: \\${MYSQL_DB_PORT:-3306}
      DB_DATABASE: \\${MYSQL_DB_DATABASE:-zintrust}
      DB_USERNAME: \\${MYSQL_DB_USERNAME:-zintrust}
      DB_PASSWORD: \\${MYSQL_DB_PASSWORD:-zintrust}
      MYSQL_PROXY_POOL_LIMIT: \\${MYSQL_PROXY_POOL_LIMIT:-100}
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('node:http').get('http://127.0.0.1:8789/health', (r)=>{process.exit(r.statusCode===200?0:1)}).on('error', ()=>process.exit(1));",
        ]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

  proxy-pg:
    <<: *proxy-runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:postgres', '--host', '0.0.0.0', '--port', '8790']
    expose:
      - '8790'
    environment:
      APP_NAME: \\${APP_NAME:-ZinTrust}
      APP_KEY: \\${APP_KEY:-}
      POSTGRES_PROXY_REQUIRE_SIGNING: \\${POSTGRES_PROXY_REQUIRE_SIGNING:-true}
      POSTGRES_PROXY_KEY_ID: \\${POSTGRES_PROXY_KEY_ID:-}
      POSTGRES_PROXY_SECRET: \\${POSTGRES_PROXY_SECRET:-}
      POSTGRES_PROXY_SIGNING_WINDOW_MS: \\${POSTGRES_PROXY_SIGNING_WINDOW_MS:-60000}
      DB_HOST: \\${POSTGRES_DB_HOST:-host.docker.internal}
      DB_PORT_POSTGRESQL: \\${POSTGRES_DB_PORT:-5432}
      DB_DATABASE_POSTGRESQL: \\${POSTGRES_DB_DATABASE:-postgres}
      DB_USERNAME_POSTGRESQL: \\${POSTGRES_DB_USERNAME:-postgres}
      DB_PASSWORD_POSTGRESQL: \\${POSTGRES_DB_PASSWORD:-postgres}
      POSTGRES_PROXY_POOL_LIMIT: \\${POSTGRES_PROXY_POOL_LIMIT:-100}
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('node:http').get('http://127.0.0.1:8790/health', (r)=>{process.exit(r.statusCode===200?0:1)}).on('error', ()=>process.exit(1));",
        ]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

  proxy-redis:
    <<: *proxy-runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:redis', '--host', '0.0.0.0', '--port', '8791']
    expose:
      - '8791'
    environment:
      APP_NAME: \\${APP_NAME:-ZinTrust}
      APP_KEY: \\${APP_KEY:-}
      REDIS_PROXY_REQUIRE_SIGNING: \\${REDIS_PROXY_REQUIRE_SIGNING:-true}
      REDIS_PROXY_KEY_ID: \\${REDIS_PROXY_KEY_ID:-}
      REDIS_PROXY_SECRET: \\${REDIS_PROXY_SECRET:-}
      REDIS_PROXY_SIGNING_WINDOW_MS: \\${REDIS_PROXY_SIGNING_WINDOW_MS:-60000}
      REDIS_HOST: \\${REDIS_PROXY_TARGET_HOST:-host.docker.internal}
      REDIS_PORT: \\${REDIS_PROXY_TARGET_PORT:-6379}
      REDIS_PASSWORD: \\${REDIS_PROXY_TARGET_PASSWORD:-}
      REDIS_DB: \\${REDIS_PROXY_TARGET_DB:-0}
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('node:http').get('http://127.0.0.1:8791/health', (r)=>{process.exit(r.statusCode===200?0:1)}).on('error', ()=>process.exit(1));",
        ]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

  proxy-mongodb:
    <<: *proxy-runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:mongodb', '--host', '0.0.0.0', '--port', '8792']
    expose:
      - '8792'
    environment:
      APP_NAME: \\${APP_NAME:-ZinTrust}
      APP_KEY: \\${APP_KEY:-}
      MONGODB_PROXY_REQUIRE_SIGNING: \\${MONGODB_PROXY_REQUIRE_SIGNING:-true}
      MONGODB_PROXY_KEY_ID: \\${MONGODB_PROXY_KEY_ID:-}
      MONGODB_PROXY_SECRET: \\${MONGODB_PROXY_SECRET:-}
      MONGODB_PROXY_SIGNING_WINDOW_MS: \\${MONGODB_PROXY_SIGNING_WINDOW_MS:-60000}
      MONGO_URI: \\${MONGODB_PROXY_TARGET_URI:-mongodb://host.docker.internal:27017}
      MONGO_DB: \\${MONGODB_PROXY_TARGET_DB:-zintrust}
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('node:http').get('http://127.0.0.1:8792/health', (r)=>{process.exit(r.statusCode===200?0:1)}).on('error', ()=>process.exit(1));",
        ]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

  proxy-sqlserver:
    <<: *proxy-runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:sqlserver', '--host', '0.0.0.0', '--port', '8793']
    expose:
      - '8793'
    environment:
      APP_NAME: \\${APP_NAME:-ZinTrust}
      APP_KEY: \\${APP_KEY:-}
      SQLSERVER_PROXY_REQUIRE_SIGNING: \\${SQLSERVER_PROXY_REQUIRE_SIGNING:-true}
      SQLSERVER_PROXY_KEY_ID: \\${SQLSERVER_PROXY_KEY_ID:-}
      SQLSERVER_PROXY_SECRET: \\${SQLSERVER_PROXY_SECRET:-}
      SQLSERVER_PROXY_SIGNING_WINDOW_MS: \\${SQLSERVER_PROXY_SIGNING_WINDOW_MS:-60000}
      DB_HOST_MSSQL: \\${SQLSERVER_DB_HOST:-host.docker.internal}
      DB_PORT_MSSQL: \\${SQLSERVER_DB_PORT:-1433}
      DB_DATABASE_MSSQL: \\${SQLSERVER_DB_DATABASE:-zintrust}
      DB_USERNAME_MSSQL: \\${SQLSERVER_DB_USERNAME:-sa}
      DB_PASSWORD_MSSQL: \\${SQLSERVER_DB_PASSWORD:-}
      SQLSERVER_PROXY_POOL_LIMIT: \\${SQLSERVER_PROXY_POOL_LIMIT:-100}
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('node:http').get('http://127.0.0.1:8793/health', (r)=>{process.exit(r.statusCode===200?0:1)}).on('error', ()=>process.exit(1));",
        ]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

  proxy-smtp:
    <<: *proxy-runtime
    command: ['node', 'dist/bin/zin.js', 'proxy:smtp', '--host', '0.0.0.0', '--port', '8794']
    expose:
      - '8794'
    environment:
      APP_NAME: \\${APP_NAME:-ZinTrust}
      APP_KEY: \\${APP_KEY:-}
      SMTP_PROXY_REQUIRE_SIGNING: \\${SMTP_PROXY_REQUIRE_SIGNING:-true}
      SMTP_PROXY_KEY_ID: \\${SMTP_PROXY_KEY_ID:-}
      SMTP_PROXY_SECRET: \\${SMTP_PROXY_SECRET:-}
      SMTP_PROXY_SIGNING_WINDOW_MS: \\${SMTP_PROXY_SIGNING_WINDOW_MS:-60000}
      MAIL_HOST: \\${SMTP_TARGET_HOST:-host.docker.internal}
      MAIL_PORT: \\${SMTP_TARGET_PORT:-587}
      MAIL_SECURE: \\${SMTP_TARGET_SECURE:-false}
      MAIL_USERNAME: \\${SMTP_TARGET_USERNAME:-}
      MAIL_PASSWORD: \\${SMTP_TARGET_PASSWORD:-}
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "require('node:http').get('http://127.0.0.1:8794/health', (r)=>{process.exit(r.statusCode===200?0:1)}).on('error', ()=>process.exit(1));",
        ]
      interval: 20s
      timeout: 5s
      retries: 5
      start_period: 15s

networks:
  zintrust-proxy-network:
    driver: bridge
`;

const NGINX_PROXY_GATEWAY_TEMPLATE = `worker_processes auto;
worker_rlimit_nofile 200000;

events {
  worker_connections 8192;
  multi_accept on;
  use epoll;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 30s;
  keepalive_requests 10000;

  client_max_body_size 2m;
  client_body_buffer_size 128k;

  server_tokens off;
  types_hash_max_size 4096;

  resolver 127.0.0.11 valid=10s ipv6=off;
  resolver_timeout 2s;

  access_log /var/log/nginx/access.log;
  error_log /var/log/nginx/error.log warn;

  server {
    listen 8080 reuseport backlog=65535;
    server_name _;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    proxy_connect_timeout 2s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;

    proxy_buffering on;
    proxy_request_buffering on;
    proxy_buffer_size 8k;
    proxy_buffers 16 16k;
    proxy_busy_buffers_size 64k;

    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_next_upstream_tries 3;
    proxy_next_upstream_timeout 5s;

    location = /health {
      default_type application/json;
      return 200 '{"status":"ok","service":"proxy-gateway"}';
    }

    location /mysql/ {
      rewrite ^/mysql/?(.*)$ /$1 break;
      set $upstream proxy-mysql:8789;
      proxy_pass http://$upstream;
    }

    location /postgres/ {
      rewrite ^/postgres/?(.*)$ /$1 break;
      set $upstream proxy-pg:8790;
      proxy_pass http://$upstream;
    }

    location /redis/ {
      rewrite ^/redis/?(.*)$ /$1 break;
      set $upstream proxy-redis:8791;
      proxy_pass http://$upstream;
    }

    location /mongodb/ {
      rewrite ^/mongodb/?(.*)$ /$1 break;
      set $upstream proxy-mongodb:8792;
      proxy_pass http://$upstream;
    }

    location /sqlserver/ {
      rewrite ^/sqlserver/?(.*)$ /$1 break;
      set $upstream proxy-sqlserver:8793;
      proxy_pass http://$upstream;
    }

    location /smtp/ {
      rewrite ^/smtp/?(.*)$ /$1 break;
      set $upstream proxy-smtp:8794;
      proxy_pass http://$upstream;
    }
  }
}
`;

async function writeDockerComposeFile(cwd: string): Promise<void> {
  const composePath = join(cwd, 'docker-compose.proxy.yml');

  let shouldWrite = true;
  if (existsSync(composePath)) {
    shouldWrite = await PromptHelper.confirm('docker-compose.proxy.yml already exists. Overwrite?', false);
  }

  if (shouldWrite) {
    writeFileSync(composePath, DOCKER_COMPOSE_PROXY_TEMPLATE);
    Logger.info('✅ Created docker-compose.proxy.yml');
  } else {
    Logger.info('Skipped docker-compose.proxy.yml');
  }
}

async function writeNginxConfig(cwd: string): Promise<void> {
  const gatewayDir = join(cwd, 'docker', 'proxy-gateway');
  const nginxPath = join(gatewayDir, 'nginx.conf');

  if (!existsSync(gatewayDir)) {
    mkdirSync(gatewayDir, { recursive: true });
  }

  let shouldWrite = true;
  if (existsSync(nginxPath)) {
    shouldWrite = await PromptHelper.confirm(
      'docker/proxy-gateway/nginx.conf already exists. Overwrite?',
      false
    );
  }

  if (shouldWrite) {
    writeFileSync(nginxPath, NGINX_PROXY_GATEWAY_TEMPLATE);
    Logger.info('✅ Created docker/proxy-gateway/nginx.conf');
  } else {
    Logger.info('Skipped docker/proxy-gateway/nginx.conf');
  }
}

export const InitProxyCommand = Object.freeze({
  create(): IBaseCommand {
    return BaseCommand.create({
      name: 'init:proxy',
      aliases: ['init:cp', 'init:container-proxies', 'init:py/proxy'],
      description: 'Initialize container-based proxy stack infrastructure',
      async execute(): Promise<void> {
        Logger.info('Initializing container-based proxy stack infrastructure...');

        const cwd = process.cwd();
        await writeDockerComposeFile(cwd);
        await writeNginxConfig(cwd);

        Logger.info('✅ Proxy stack scaffolding complete.');
        Logger.info('Run with: zin cp up -d');
        await Promise.resolve();
      },
    });
  },
});
