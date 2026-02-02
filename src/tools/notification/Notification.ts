/**
 * Notification - Public API entry point
 *
 * A small wrapper over NotificationService to provide the expected module name.
 */

import { NotificationService } from '@notification/Service';

export const Notification = Object.freeze({
  send: NotificationService.send,

  // Alias for send() - explicit intent for immediate notification
  NotifyNow: NotificationService.send,

  // Queue notification for async processing
  async NotifyLater(
    recipient: string,
    message: string,
    notifyOptions: Record<string, unknown> = {},
    queueOptions: { queueName?: string; timestamp?: number } = {}
  ): Promise<string> {
    const { queueName = 'notifications', timestamp = Date.now() } = queueOptions;
    const { Queue } = await import('@tools/queue/Queue');
    const messageId = await Queue.enqueue(queueName, {
      type: 'notification',
      recipient,
      message,
      options: notifyOptions,
      timestamp,
      attempts: 0,
    });
    return messageId ?? '';
  },

  queue(queueName: string) {
    return Object.freeze({
      NotifyLater: async (
        recipient: string,
        message: string,
        notifyOptions: Record<string, unknown> = {},
        queueOptions: { timestamp?: number } = {}
      ) =>
        Notification.NotifyLater(recipient, message, notifyOptions, { ...queueOptions, queueName }),
    });
  },

  channel: (name: string) =>
    Object.freeze({
      send: async (recipient: string, message: string, options?: Record<string, unknown>) =>
        NotificationService.sendVia(name, recipient, message, options),
    }),
  listDrivers: NotificationService.listDrivers,
});

export default Notification;
