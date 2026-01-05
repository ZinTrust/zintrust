import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/notification', () => ({
  default: {
    providers: {
      twilio: {
        accountSid: 'AC123',
        authToken: 'token',
        fromNumber: '+10000000000',
      },
    },
  },
}));

const sendMock = vi.fn().mockResolvedValue({ sid: 'SM123' });
vi.mock('@notification/drivers/Twilio', () => ({
  TwilioDriver: {
    send: sendMock,
  },
}));

describe('TwilioNotificationDriver patch coverage', () => {
  it('forwards provider config to TwilioDriver.send', async () => {
    const { TwilioNotificationDriver } = await import('@notification/drivers/TwilioNotification');

    await TwilioNotificationDriver.send('+19999999999', 'hello');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountSid: 'AC123',
        authToken: 'token',
        from: '+10000000000',
      }),
      expect.objectContaining({
        to: '+19999999999',
        body: 'hello',
      })
    );
  });
});
