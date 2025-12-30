import { ErrorFactory } from '@exceptions/ZintrustError';

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  from: string;
};

export type TwilioMessage = {
  to: string;
  body: string;
};

const buildUrl = (accountSid: string): string => {
  const base = 'https://api.twilio.com/2010-04-01/Accounts/';
  return `${base}${accountSid}/Messages.json`;
};

export const TwilioDriver = Object.freeze({
  async send(
    config: TwilioConfig,
    payload: TwilioMessage
  ): Promise<{ ok: boolean; status?: number }> {
    const accountSid = config.accountSid ?? '';
    const authToken = config.authToken ?? '';
    const from = config.from ?? '';

    if (typeof accountSid !== 'string' || accountSid.trim() === '') {
      throw ErrorFactory.createConfigError('Twilio: missing accountSid');
    }
    if (typeof authToken !== 'string' || authToken.trim() === '') {
      throw ErrorFactory.createConfigError('Twilio: missing authToken');
    }
    if (typeof from !== 'string' || from.trim() === '') {
      throw ErrorFactory.createConfigError('Twilio: missing from number');
    }

    if (typeof payload.to !== 'string' || payload.to.trim() === '') {
      throw ErrorFactory.createValidationError('Twilio: missing to number');
    }

    const url = buildUrl(accountSid);

    const params = new URLSearchParams();
    params.append('To', payload.to);
    params.append('From', from);
    params.append('Body', payload.body);

    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      throw ErrorFactory.createConnectionError(`Twilio API failed (${res.status})`, {
        status: res.status,
        body,
      });
    }

    return { ok: true, status: res.status };
  },
});

export const sendSms = async (
  config: TwilioConfig,
  payload: TwilioMessage
): Promise<{ ok: boolean; status?: number }> => TwilioDriver.send(config, payload);

export default TwilioDriver;
