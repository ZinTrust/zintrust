import notificationConfig from '@config/notification';
import { describe, expect, test } from 'vitest';

describe('notification config', () => {
  test('default driver name from Env.get', () => {
    // default should be 'console' when not set
    const prev = process.env['NOTIFICATION_DRIVER'];
    delete process.env['NOTIFICATION_DRIVER'];
    expect(notificationConfig.getDriverName()).toBe('console');
    process.env['NOTIFICATION_DRIVER'] = 'Slack';
    expect(notificationConfig.getDriverName()).toBe('slack');
    if (prev === undefined) delete process.env['NOTIFICATION_DRIVER'];
    else process.env['NOTIFICATION_DRIVER'] = prev;
  });

  test('providers shape', () => {
    expect(notificationConfig.providers.console.driver).toBe('console');
    expect(notificationConfig.providers.termii.driver).toBe('termii');
    expect(notificationConfig.providers.twilio.driver).toBe('twilio');
    expect(notificationConfig.providers.slack.driver).toBe('slack');
  });
});
