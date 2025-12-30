/**
 * Notification - Public API entry point
 *
 * A small wrapper over NotificationService to provide the expected module name.
 */

import { NotificationService } from '@notification/Service';

export const Notification = Object.freeze({
  send: NotificationService.send,
  listDrivers: NotificationService.listDrivers,
});

export default Notification;
