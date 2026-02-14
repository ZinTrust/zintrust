import { Logger } from '@config/logger';
import { JobHeartbeatStore } from '@queue/JobHeartbeatStore';
import { JobStateTracker } from '@queue/JobStateTracker';

export const StalledJobMonitor = Object.freeze({
  async scanOnce(): Promise<number> {
    const expired = await JobHeartbeatStore.listExpired();

    await Promise.all(
      expired.map(async (row) => {
        await JobStateTracker.stalled({
          queueName: row.queueName,
          jobId: row.jobId,
          reason: 'Heartbeat expired',
        });
        await JobHeartbeatStore.remove(row.queueName, row.jobId);
      })
    );

    if (expired.length > 0) {
      Logger.warn('Stalled jobs detected from heartbeat store', { count: expired.length });
    }

    return expired.length;
  },
});

export default StalledJobMonitor;
