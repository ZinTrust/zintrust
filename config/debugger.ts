// @ts-ignore - config templates are excluded from the main TS project in this repo
import type { DebuggerConfigOverrides } from '@zintrust/system-debugger';
import { Env } from '@config/env';

/**
 * SystemDebugger Configuration
 *
 * Keep this file declarative:
 * - Package owns defaults and type validation.
 * - Edit values below to override for this project.
 *
 * Usage: import '@zintrust/system-debugger/register' in your bootstrap.
 * Protect /debugger with your own middleware (auth, admin role, etc.).
 */

export default {
  enabled: Env.getBool('DEBUGGER_ENABLED', false),

  // Optional: use a separate DB connection for debugger tables.
  // Leave undefined to fall back to the app's default connection.
  connection: Env.get('DEBUGGER_DB_CONNECTION', '') || undefined,

  pruneAfterHours: Env.getInt('DEBUGGER_PRUNE_HOURS', 24),

  ignoreRoutes: ['/debugger', '/health', '/ping'],

  slowQueryThreshold: Env.getInt('DEBUGGER_SLOW_QUERY_MS', 100),

  logMinLevel: Env.get('DEBUGGER_LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error' | 'fatal',

  watchers: {
    // Set a watcher to false to disable it entirely.
    // All watchers are enabled by default when debugger is enabled.
    // dump: false,  // DumpWatcher is opt-in — enable explicitly if needed
  },

  redaction: {
    headers: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    body: ['password', 'token', 'secret', 'apiKey', 'api_key', 'jwt', 'bearer'],
    query: [],
  },
} satisfies DebuggerConfigOverrides;
