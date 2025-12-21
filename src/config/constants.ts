/**
 * Framework Constants
 * Centralized string literals to prevent duplication (SonarQube S1192)
 */

export const HTTP_HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  ACCEPT: 'Accept',
  AUTHORIZATION: 'Authorization',
  X_TRACE_ID: 'X-Trace-Id',
  X_SERVICE_CALL: 'X-Service-Call',
  X_POWERED_BY: 'X-Powered-By',
  X_CONTENT_TYPE_OPTIONS: 'X-Content-Type-Options',
  X_FRAME_OPTIONS: 'X-Frame-Options',
  X_XSS_PROTECTION: 'X-XSS-Protection',
  REFERRER_POLICY: 'Referrer-Policy',
  CONTENT_SECURITY_POLICY: 'Content-Security-Policy',
} as const;

export const MIME_TYPES = {
  JSON: 'application/json',
  HTML: 'text/html',
  TEXT: 'text/plain',
  JS: 'text/javascript',
  CSS: 'text/css',
  PNG: 'image/png',
  JPG: 'image/jpg',
  GIF: 'image/gif',
  SVG: 'image/svg+xml',
  WAV: 'audio/wav',
  MP4: 'video/mp4',
  WOFF: 'application/font-woff',
  TTF: 'application/font-ttf',
  EOT: 'application/vnd.ms-fontobject',
  OTF: 'application/font-otf',
  WASM: 'application/wasm',
} as const;

export const ENV_KEYS = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  HOST: 'HOST',
  APP_NAME: 'APP_NAME',
  DB_CONNECTION: 'DB_CONNECTION',
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT',
  DB_DATABASE: 'DB_DATABASE',
  DB_USERNAME: 'DB_USERNAME',
  DB_PASSWORD: 'DB_PASSWORD', // NOSONARQUBE
} as const;

export const DEFAULTS = {
  CONNECTION: 'default',
  DOMAIN: 'default',
  NAMESPACE: 'default',
} as const;
