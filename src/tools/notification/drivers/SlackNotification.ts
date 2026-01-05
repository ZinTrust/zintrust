import notificationConfig from '@config/notification';
import { SlackDriver } from '@notification/drivers/Slack';

export const SlackNotificationDriver = Object.freeze({
  async send(_recipient: string, message: string, options: Record<string, unknown> = {}) {
    const cfg = notificationConfig.providers.slack;

    const payload: Record<string, unknown> = {
      text: message,
      ...options,
    };

    return SlackDriver.send({ webhookUrl: cfg.webhookUrl }, payload);
  },
});

export default SlackNotificationDriver;
