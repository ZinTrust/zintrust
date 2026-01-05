/**
 * Notification - Public API entry point
 *
 * A small wrapper over NotificationService to provide the expected module name.
 */

import { NotificationService } from '@notification/Service';

export const Notification = Object.freeze({
  send: NotificationService.send,
  channel: (name: string) =>
    Object.freeze({
      send: async (recipient: string, message: string, options?: Record<string, unknown>) =>
        NotificationService.sendVia(name, recipient, message, options),
    }),
  listDrivers: NotificationService.listDrivers,
});

export default Notification;
