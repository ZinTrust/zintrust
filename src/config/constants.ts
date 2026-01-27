/**
 * Framework Constants
 * Centralized string literals to prevent duplication (SonarQube S1192)
 * Sealed namespace for immutability
 */

const HTTP_HEADERS = {
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

const MIME_TYPES = {
  JSON: 'application/json',
  HTML: 'text/html',
  TEXT: 'text/plain',
  JS: 'text/javascript',
  CSS: 'text/css',

  // Images
  PNG: 'image/png',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  GIF: 'image/gif',
  ICO: 'image/x-icon',
  SVG: 'image/svg+xml',
  WEBP: 'image/webp',
  AVIF: 'image/avif',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  BMP: 'image/bmp',
  TIFF: 'image/tiff',

  // Videos
  MP4: 'video/mp4',
  WEBM: 'video/webm',
  OGG: 'video/ogg',
  AVI: 'video/x-msvideo',
  MOV: 'video/quicktime',
  WMV: 'video/x-ms-wmv',
  FLV: 'video/x-flv',
  MKV: 'video/x-matroska',
  M4V: 'video/x-m4v',

  // Audio
  WAV: 'audio/wav',
  MP3: 'audio/mpeg',
  OGA: 'audio/ogg',
  FLAC: 'audio/flac',
  AAC: 'audio/aac',
  M4A: 'audio/mp4',
  WMA: 'audio/x-ms-wma',

  // Fonts
  WOFF: 'font/woff',
  WOFF2: 'font/woff2',
  TTF: 'font/ttf',
  OTF: 'font/otf',
  EOT: 'application/vnd.ms-fontobject',

  // Documents
  PDF: 'application/pdf',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  XLS: 'application/vnd.ms-excel',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PPT: 'application/vnd.ms-powerpoint',
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ODT: 'application/vnd.oasis.opendocument.text',
  ODS: 'application/vnd.oasis.opendocument.spreadsheet',
  ODP: 'application/vnd.oasis.opendocument.presentation',

  // Archives
  ZIP: 'application/zip',
  RAR: 'application/x-rar-compressed',
  TAR: 'application/x-tar',
  GZIP: 'application/gzip',
  SEVEN_Z: 'application/x-7z-compressed',

  // iOS specific
  PLIST: 'application/x-plist',
  IPA: 'application/octet-stream',
  MOBILECONFIG: 'application/x-apple-aspen-config',

  // Android specific
  APK: 'application/vnd.android.package-archive',
  AAB: 'application/x-authorware-bin',

  // Web/App Manifests
  MANIFEST: 'application/manifest+json',
  WEBAPP: 'application/x-web-app-manifest+json',

  // API/Data formats
  XML: 'application/xml',
  YAML: 'application/x-yaml',
  CSV: 'text/csv',
  RTF: 'application/rtf',

  // Binary/Executable
  WASM: 'application/wasm',
  EXE: 'application/x-msdownload',
  DMG: 'application/x-apple-diskimage',

  // Standards
  XHTML: 'application/xhtml+xml',
  ATOM: 'application/atom+xml',
  RSS: 'application/rss+xml',

  // Security/Certificates
  PEM: 'application/x-pem-file',
  P12: 'application/x-pkcs12',
  PFX: 'application/x-pkcs12',
  CRT: 'application/x-x509-ca-cert',
  CER: 'application/x-x509-ca-cert',

  // Database
  SQLITE: 'application/x-sqlite3',

  // 3D/VR
  GLTF: 'model/gltf+json',
  GLB: 'model/gltf-binary',
  OBJ: 'model/obj',

  // Other common formats
  CUR: 'image/x-icon',
  ANI: 'application/x-navi-animation',
} as const;

const ENV_KEYS = {
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

const DEFAULTS = {
  CONNECTION: 'default',
  DOMAIN: 'default',
  NAMESPACE: 'default',
} as const;

/**
 * Constants namespace - sealed for immutability
 */
export const Constants = Object.freeze({
  HTTP_HEADERS,
  MIME_TYPES,
  ENV_KEYS,
  DEFAULTS,
});

// Re-export for backward compatibility
export { DEFAULTS, ENV_KEYS, HTTP_HEADERS, MIME_TYPES };
