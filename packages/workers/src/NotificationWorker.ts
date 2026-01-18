/**
 * NotificationWorker - Processes queued notifications
 *
 * This worker dequeues notification messages and sends them using the Notification service.
 * Use with Queue.dequeue() in a background process or cron job.
 */

import { Notification } from '@zintrust/core';
import { createQueueWorker } from './createQueueWorker';

type NotificationJob = {
  recipient: string;
  message: string;
  options: Record<string, unknown>;
  timestamp: number;
};

export const NotificationWorker = Object.freeze({
  ...createQueueWorker<NotificationJob>({
    kindLabel: 'notification',
    defaultQueueName: 'notifications',
    maxAttempts: 3,
    getLogFields: (payload) => ({
      recipient: payload.recipient,
      queuedAt: payload.timestamp,
    }),
    handle: async (payload) => {
      await Notification.send(payload.recipient, payload.message, payload.options);
    },
  }),
});

export default NotificationWorker;
