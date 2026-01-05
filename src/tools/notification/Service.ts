import notificationConfig from '@config/notification';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { NotificationConfig } from '@notification/config';
import { ConsoleDriver } from '@notification/drivers/Console';
import { SlackDriver } from '@notification/drivers/Slack';
import { TwilioDriver } from '@notification/drivers/Twilio';
import { NotificationChannelRegistry } from '@notification/NotificationChannelRegistry';
import { NotificationRegistry } from '@notification/Registry';

const assertValidRecipientAndMessage = (recipient: unknown, message: unknown): void => {
  if (typeof recipient !== 'string' || recipient.trim() === '') {
    throw ErrorFactory.createValidationError('Recipient required');
  }
  if (typeof message !== 'string' || message.trim() === '') {
    throw ErrorFactory.createValidationError('Message required');
  }
};

const resolveChannelConfig = (channelName: string): unknown => {
  const selected = String(channelName ?? '').trim();
  const hasSelection = selected.length > 0;

  return hasSelection && NotificationChannelRegistry.has(selected)
    ? NotificationChannelRegistry.get(selected)
    : notificationConfig.getDriverConfig(selected);
};

const sendTermii = async (
  cfg: { apiKey?: unknown; sender?: unknown; endpoint?: unknown },
  recipient: string,
  message: string,
  options: Record<string, unknown>
): Promise<unknown> => {
  const apiKey = String(cfg.apiKey ?? '');
  if (apiKey.trim() === '') {
    throw ErrorFactory.createConfigError('TERMII_API_KEY is not configured');
  }

  const url = String(cfg.endpoint ?? '').trim();
  if (url === '') {
    throw ErrorFactory.createConfigError('TERMII_ENDPOINT is not configured');
  }

  const payload = {
    to: recipient,
    from: cfg.sender,
    sms: message,
    api_key: apiKey,
    ...options,
  } as Record<string, unknown>;

  const res = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw ErrorFactory.createTryCatchError(`Termii request failed (${res.status})`, {
      status: res.status,
      body: txt,
    });
  }

  return res.json().catch(() => ({}));
};

export const NotificationService = Object.freeze({
  async send(recipient: string, message: string, options: Record<string, unknown> = {}) {
    assertValidRecipientAndMessage(recipient, message);

    const driverName = NotificationConfig.getDriver();
    const driver = NotificationRegistry.get(driverName);

    return driver.send(recipient, message, options);
  },

  async sendVia(
    channelName: string,
    recipient: string,
    message: string,
    options: Record<string, unknown> = {}
  ) {
    assertValidRecipientAndMessage(recipient, message);

    const cfg = resolveChannelConfig(channelName) as { driver?: unknown };

    switch (cfg.driver) {
      case 'console':
        return ConsoleDriver.send(recipient, message, options);

      case 'slack': {
        const slackCfg = cfg as { webhookUrl: string };
        const payload: Record<string, unknown> = { text: message, ...options };
        return SlackDriver.send({ webhookUrl: slackCfg.webhookUrl }, payload);
      }

      case 'twilio': {
        const twilioCfg = cfg as {
          accountSid: string;
          authToken: string;
          fromNumber: string;
        };
        return TwilioDriver.send(
          {
            accountSid: twilioCfg.accountSid,
            authToken: twilioCfg.authToken,
            from: twilioCfg.fromNumber,
          },
          { to: recipient, body: message }
        );
      }

      case 'termii': {
        return sendTermii(
          cfg as { apiKey?: unknown; sender?: unknown; endpoint?: unknown },
          recipient,
          message,
          options
        );
      }

      default:
        throw ErrorFactory.createConfigError(
          `Notification: unsupported driver: ${String((cfg as { driver?: unknown })?.driver)}`
        );
    }
  },

  listDrivers(): string[] {
    return NotificationRegistry.list();
  },
});

export default NotificationService;
