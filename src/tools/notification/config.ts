import { Env } from '@config/env';

export const NotificationConfig = Object.freeze({
  getDriver: (): string => Env.get('NOTIFICATION_DRIVER', 'console').trim().toLowerCase(),
});

export default NotificationConfig;
