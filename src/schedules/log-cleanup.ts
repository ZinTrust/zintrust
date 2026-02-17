import { Env } from '@config/env';
import { Logger, cleanLogsOnce } from '@config/logger';
import { Schedule } from '@scheduler/Schedule';

const LogCleanupSchedule = Schedule.define('log.cleanup', async () => {
  try {
    await cleanLogsOnce();
  } catch (err) {
    Logger.error('Log cleanup schedule failed', err as Error);
  }
})
  .intervalMs(Env.getInt('LOG_CLEANUP_INTERVAL_MS', 3600000))
  .enabledWhen(Env.getBool('LOG_CLEANUP_ENABLED', Env.getBool('LOG_TO_FILE', false)))
  .build();

export default LogCleanupSchedule;
