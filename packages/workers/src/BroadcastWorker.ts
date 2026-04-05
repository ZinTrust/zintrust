/**
 * BroadcastWorker - Processes queued broadcasts
 *
 * This worker dequeues broadcast messages and sends them using the Broadcast service.
 * Use with Queue.dequeue() in a background process or cron job.
 */

import { Broadcast } from '@zintrust/core';
import { createQueueWorker } from './createQueueWorker';

type BroadcastJob = {
  channel?: string;
  channels?: readonly string[];
  event: string;
  data: unknown;
  delivery?: 'auto' | 'socket' | 'driver';
  broadcaster?: string;
  socketId?: string;
  timestamp: number;
};

export const BroadcastWorker = Object.freeze({
  ...createQueueWorker<BroadcastJob>({
    kindLabel: 'broadcast',
    defaultQueueName: 'broadcasts',
    maxAttempts: 3,
    getLogFields: (payload) => ({
      channel: payload.channel ?? payload.channels?.[0] ?? '',
      event: payload.event,
      queuedAt: payload.timestamp,
    }),
    handle: async (payload) => {
      await Broadcast.publish({
        channel: payload.channel,
        channels: payload.channels,
        event: payload.event,
        data: payload.data,
        delivery: payload.delivery,
        broadcaster: payload.broadcaster,
        socketId: payload.socketId,
      });
    },
  }),
});

export default BroadcastWorker;
