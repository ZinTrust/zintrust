import type { CloudflareJobStore } from './CloudflareJobStore.js';
import type { CloudflareQueueEnvelope, CloudflareQueueConfig } from './types.js';

type SchedulerQueueApi = {
  enqueue<T = unknown>(queue: string, payload: T): Promise<string>;
};

export type CloudflareQueueSchedulerConfig = {
  queueName: string;
  store: CloudflareJobStore;
  queue: SchedulerQueueApi;
  batchSize?: number;
  stalledAfterMs?: number;
};

const toEnvelope = (input: {
  queueName: string;
  jobId: string;
  name: string;
  attempt: number;
  availableAt: string;
}): CloudflareQueueEnvelope => ({
  protocol: 'zintrust.cf.queue.v1',
  jobId: input.jobId,
  queueName: input.queueName,
  name: input.name,
  attempt: input.attempt,
  availableAt: input.availableAt,
});

const createScheduler = (config: CloudflareQueueSchedulerConfig) => {
  return {
    async dispatchDueJobs(): Promise<number> {
      const jobs = await config.store.getDueJobs(config.queueName, config.batchSize);
      let dispatched = 0;

      for (const job of jobs) {
        await config.queue.enqueue(
          config.queueName,
          toEnvelope({
            queueName: job.queueName,
            jobId: job.id,
            name: job.name,
            attempt: job.attemptsMade,
            availableAt: job.availableAt,
          })
        );
        await config.store.markDispatched(job.queueName, job.id);
        dispatched += 1;
      }

      return dispatched;
    },

    async dispatchRepeatables(): Promise<number> {
      const rows = await config.store.getDueRepeatables(config.batchSize);
      let dispatched = 0;

      for (const row of rows) {
        const payload = JSON.parse(row.payload) as unknown;
        const job = await config.store.createJob({
          queueName: row.queue_name,
          name: row.name,
          data: payload,
        });
        await config.queue.enqueue(
          row.queue_name,
          toEnvelope({
            queueName: row.queue_name,
            jobId: job.id,
            name: row.name,
            attempt: 0,
            availableAt: job.availableAt,
          })
        );
        await config.store.markDispatched(job.queueName, job.id);
        await config.store.updateRepeatableAfterRun(row);
        dispatched += 1;
      }

      return dispatched;
    },

    async reconcileStalled(): Promise<number> {
      const stalled = await config.store.getStalledJobs(
        config.queueName,
        config.stalledAfterMs ?? 60_000,
        config.batchSize
      );
      let retried = 0;

      for (const job of stalled) {
        await config.store.updateState({
          queueName: job.queueName,
          jobId: job.id,
          state: 'stalled',
        });
        await config.store.updateState({
          queueName: job.queueName,
          jobId: job.id,
          state: 'retrying',
          availableAt: new Date().toISOString(),
        });
        await config.queue.enqueue(
          job.queueName,
          toEnvelope({
            queueName: job.queueName,
            jobId: job.id,
            name: job.name,
            attempt: job.attemptsMade,
            availableAt: job.availableAt,
          })
        );
        await config.store.markDispatched(job.queueName, job.id);
        retried += 1;
      }

      return retried;
    },

    async run(): Promise<{ jobs: number; repeatables: number }> {
      await this.reconcileStalled();
      const repeatables = await this.dispatchRepeatables();
      const jobs = await this.dispatchDueJobs();
      return { jobs, repeatables };
    },
  };
};

export const CloudflareQueueScheduler = Object.freeze({
  create: createScheduler,

  createFromQueueConfig(input: {
    queueName: string;
    config: CloudflareQueueConfig;
    store: CloudflareJobStore;
    queue: SchedulerQueueApi;
    batchSize?: number;
  }) {
    return createScheduler({
      queueName: input.queueName,
      store: input.store,
      queue: input.queue,
      batchSize: input.batchSize,
    });
  },

  createScheduledHandler(config: CloudflareQueueSchedulerConfig) {
    const scheduler = createScheduler(config);
    return async (): Promise<{ jobs: number; repeatables: number }> => await scheduler.run();
  },
});
