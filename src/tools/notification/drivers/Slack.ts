import { ErrorFactory } from '@exceptions/ZintrustError';

export type SlackConfig = {
  webhookUrl: string;
};

export type SlackMessage = Record<string, unknown>;

export const SlackDriver = Object.freeze({
  async send(
    config: SlackConfig,
    payload: SlackMessage
  ): Promise<{ ok: boolean; status?: number }> {
    const url = config.webhookUrl ?? '';
    if (typeof url !== 'string' || url.trim() === '') {
      throw ErrorFactory.createConfigError('Slack: missing webhook URL');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw ErrorFactory.createConnectionError(`Slack webhook failed (${res.status})`, {
        status: res.status,
        body: text,
      });
    }

    return { ok: true, status: res.status };
  },
});

export const sendSlackWebhook = async (
  config: SlackConfig,
  payload: SlackMessage
): Promise<{ ok: boolean; status?: number }> => SlackDriver.send(config, payload);

export default SlackDriver;
