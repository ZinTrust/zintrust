import { NotificationConfig } from '@notification/config';
import { describe, expect, it } from 'vitest';

describe('Notification Config', () => {
  it('defaults to console driver', () => {
    const driver = NotificationConfig.getDriver();
    expect(driver).toBe('console');
  });

  it('reads environment variable', () => {
    process.env['NOTIFICATION_DRIVER'] = 'Twilio';
    const driver = NotificationConfig.getDriver();
    expect(driver).toBe('twilio');
    delete process.env['NOTIFICATION_DRIVER'];
  });
});
