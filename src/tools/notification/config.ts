export const NotificationConfig = Object.freeze({
  getDriver: (): string => (process.env['NOTIFICATION_DRIVER'] ?? 'console').trim().toLowerCase(),
});

export default NotificationConfig;
