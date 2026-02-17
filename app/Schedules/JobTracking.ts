import { Env } from '@config/env';
import Schedule from '@scheduler/Schedule';
import { cleanupJobTrackingOnce } from '@schedules/job-tracking-cleanup';

const enabled = Env.getBool('JOB_TRACKING_CLEANUP_ENABLED', false);
const intervalMs = Env.getInt('JOB_TRACKING_CLEANUP_INTERVAL_MS', 6 * 60 * 60 * 1000);
const JobTrackingCleanupSchedule = Schedule.define('jobTracking.cleanup', async () => {
  await cleanupJobTrackingOnce();
})
  .intervalMs(intervalMs)
  .withoutOverlapping({ provider: Env.get('JOB_TRACKING_CLEANUP_LOCK_PROVIDER', 'redis') })
  .enabledWhen(enabled)
  .build();

export default JobTrackingCleanupSchedule;
