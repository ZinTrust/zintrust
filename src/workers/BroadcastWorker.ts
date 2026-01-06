/**
 * BroadcastWorker - Processes queued broadcasts
 *
 * This worker dequeues broadcast messages and sends them using the Broadcast service.
 * Use with Queue.dequeue() in a background process or cron job.
 */

import { createQueueWorker } from '@/workers/createQueueWorker';
import { Broadcast } from '@broadcast/Broadcast';

type BroadcastJob = {
  channel: string;
  event: string;
  data: unknown;
  timestamp: number;
};

export const BroadcastWorker = Object.freeze({
  ...createQueueWorker<BroadcastJob>({
    kindLabel: 'broadcast',
    defaultQueueName: 'broadcasts',
    maxAttempts: 3,
    getLogFields: (payload) => ({
      channel: payload.channel,
      event: payload.event,
      queuedAt: payload.timestamp,
    }),
    handle: async (payload) => {
      await Broadcast.send(payload.channel, payload.event, payload.data);
    },
  }),
});

export default BroadcastWorker;
