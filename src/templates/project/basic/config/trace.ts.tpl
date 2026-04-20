import { Env } from '@zintrust/core';
import type { TraceConfigOverrides } from '@zintrust/trace';

/**
 * SystemTrace Configuration
 *
 * Keep this file declarative:
 * - Package owns defaults and type validation.
 * - Edit values below to override for this project.
 *
 * Usage: import '@zintrust/trace/register' in your bootstrap.
 * Protect /trace with your own middleware (auth, admin role, etc.).
 */

export default {
  enabled: Env.getBool('TRACE_ENABLED', false),

  // Optional: use a separate DB connection for trace tables.
  // Leave undefined to fall back to the app's default connection.
  connection: Env.get('TRACE_DB_CONNECTION', '') || undefined,

  pruneAfterHours: Env.getInt('TRACE_PRUNE_HOURS', 72),

  ignoreRoutes: ['/trace', '/health', '/ping', '/metrics', '/api-docs', '/api-docs-json'],

  ignorePaths: [
    '/telemetry',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/workers',
    '/queue-monitor',
    '.js',
    '.css',
  ],

  slowQueryThreshold: Env.getInt('TRACE_SLOW_QUERY_MS', 100),

  logMinLevel: Env.get('TRACE_LOG_LEVEL', 'warn') as 'debug' | 'info' | 'warn' | 'error' | 'fatal',

  watchers: {
    // Set a watcher to false to disable it entirely.
    // All watchers are enabled by default when trace is enabled.
    // Include/exclude filters are contains-based and can be applied per watcher.
    // request: {
    //   get: { exclude: ['report','workers/events'] },
    //   post: { include: ['auth'] },
    //   patch: { include: ['profile'] },
    //   delete: { exclude: ['internal'] },
    // },
    // log: { exclude: ['healthcheck'] },
    // exception: { include: ['trace'] },
    // clientRequest: {
    //   exclude: ['internal-http'],
    //   sources: {
    //     termii: { enabled: false },
    //     sendgrid: { responseBody: false },
    //     s3: { requestHeaders: false, responseHeaders: false },
    //   },
    // },
    // cache: { include: ['session:'] },
    // dump: false,  // DumpWatcher is opt-in — enable explicitly if needed
  },

  redaction: {
    // Extra keys to mask recursively before trace entries are persisted.
    // You can also provide these via TRACE_REDACT_KEYS as JSON or CSV.
    keys: ['password', 'token', 'secret', 'authorization', 'card', 'cardNumber', 'cvv'],
    headers: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    body: ['password', 'token', 'secret', 'apiKey', 'api_key', 'jwt', 'bearer'],
    query: [],
  },
} satisfies TraceConfigOverrides;
