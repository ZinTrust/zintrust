import { Env } from '@config/env';
import { Logger, cleanLogsOnce } from '@config/logger';
import type { ISchedule } from '@scheduler/types';

const intervalMs = Env.getInt('LOG_CLEANUP_INTERVAL_MS', 3600000);

const LogCleanupSchedule: ISchedule = {
  name: 'log.cleanup',
  intervalMs: intervalMs,
  handler: async () => {
    try {
      await cleanLogsOnce();
    } catch (err) {
      Logger.error('Log cleanup schedule failed', err as Error);
    }
  },
  enabled: Env.getBool('LOG_CLEANUP_ENABLED', Env.getBool('LOG_TO_FILE', false)),
  runOnStart: false,
};

export default LogCleanupSchedule;
