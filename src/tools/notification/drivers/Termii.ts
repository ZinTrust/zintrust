import { readEnvString, safeFetch, validateRequiredParams } from '@common/ExternalServiceUtils';
import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * Termii SMS Driver (skeleton)
 * - Reads TERMII_API_KEY and TERMII_SENDER from env
 * - POSTs to Termii API endpoint
 */
export const TermiiDriver = Object.freeze({
  async send(recipient: string, message: string, options: Record<string, unknown> = {}) {
    validateRequiredParams({ recipient, message }, ['recipient', 'message']);

    const apiKey = readEnvString('TERMII_API_KEY');
    const sender = readEnvString('TERMII_SENDER');

    if (!apiKey) {
      throw ErrorFactory.createConfigError('TERMII_API_KEY is not configured');
    }

    const payload = {
      to: recipient,
      from: sender,
      sms: message,
      api_key: apiKey,
      ...options,
    } as Record<string, unknown>;

    // Use shared fetch wrapper
    const url = 'https://api.termii.com/sms/send';
    const res = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    return json;
  },
});

export default TermiiDriver;
