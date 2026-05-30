/**
 * BroadcastWorker - Processes queued broadcasts
 *
 * This worker dequeues broadcast messages and sends them using the Broadcast service.
 * Use with Queue.dequeue() in a background process or cron job.
 */

import { Logger } from '@zintrust/core/logger';
import { Broadcast, isArray, isNonEmptyString } from '@zintrust/core/utils';
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

const resolveQueuedBroadcastChannels = (payload: BroadcastJob): readonly string[] => {
  if (isArray(payload.channels)) {
    const channels = payload.channels.filter(isNonEmptyString).map((channel) => channel.trim());
    if (channels.length > 0) return channels;
  }

  if (isNonEmptyString(payload.channel)) {
    return [payload.channel.trim()];
  }

  return [];
};

export const BroadcastWorker = Object.freeze({
  ...createQueueWorker<BroadcastJob>({
    kindLabel: 'broadcast',
    defaultQueueName: 'broadcasts',
    maxAttempts: 3,
    getLogFields: (payload) => ({
      channel: resolveQueuedBroadcastChannels(payload)[0] ?? '',
      event: payload.event,
      queuedAt: payload.timestamp,
    }),
    handle: async (payload) => {
      const channels = resolveQueuedBroadcastChannels(payload);

      Logger.debug('Broadcast worker publishing queued event', {
        channels,
        compatibilityChannel: payload.channel,
        event: payload.event,
        queuedAt: payload.timestamp,
        delivery: payload.delivery,
        broadcaster: payload.broadcaster,
      });

      await Broadcast.publish({
        channels,
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
