import notificationConfig from '@config/notification';
import { TwilioDriver } from '@notification/drivers/Twilio';

export const TwilioNotificationDriver = Object.freeze({
  async send(recipient: string, message: string) {
    const cfg = notificationConfig.providers.twilio;

    return TwilioDriver.send(
      {
        accountSid: cfg.accountSid,
        authToken: cfg.authToken,
        from: cfg.fromNumber,
      },
      { to: recipient, body: message }
    );
  },
});

export default TwilioNotificationDriver;
