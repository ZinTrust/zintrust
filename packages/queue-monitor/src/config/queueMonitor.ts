import { Env } from '@zintrust/core';

/**
 * Queue Monitor Configuration (default override)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override config by editing values below.
 */

export default {
  enabled: Env.getBool('QUEUE_MONITOR_ENABLED', true),
  basePath: Env.get('QUEUE_MONITOR_BASE_PATH', '/queue-monitor'),
  autoRefresh: Env.getBool('QUEUE_MONITOR_AUTO_REFRESH', true),
  refreshIntervalMs: Env.getInt('QUEUE_MONITOR_REFRESH_INTERVAL_MS', 5000),
  middleware: Env.get('QUEUE_MONITOR_MIDDLEWARE', 'auth')
    .split(',')
    .map((m: string) => m.trim())
    .filter((m: string | string[]) => m.length > 0),
  redis: {
    host: Env.get('REDIS_HOST', 'localhost'),
    port: Env.getInt('REDIS_PORT', 6379),
    password: Env.get('REDIS_PASSWORD', ''),
  },
};
