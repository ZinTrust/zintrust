/**
 * Notification Configuration (template)
 *
 * Keep this file declarative:
 * - Core owns env parsing/default logic.
 * - Projects can override values by editing `drivers` and `notificationConfigObj`.
 */

import { notificationConfig as coreNotificationConfig } from '@zintrust/core';

type NotificationConfigShape = typeof coreNotificationConfig;

export const drivers = {
  ...coreNotificationConfig.drivers,
} satisfies NotificationConfigShape['drivers'];

export const notificationConfigObj = {
  ...coreNotificationConfig,
  drivers,
} satisfies NotificationConfigShape;

const notificationConfig = notificationConfigObj;
export default notificationConfig;
