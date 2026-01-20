import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

/**
 * Termii SMS Driver (skeleton)
 * - Reads TERMII_API_KEY and TERMII_SENDER from env
 * - POSTs to Termii API endpoint
 */
export const TermiiDriver = Object.freeze({
  async send(recipient: string, message: string, options: Record<string, unknown> = {}) {
    if (!recipient || typeof recipient !== 'string') {
      throw ErrorFactory.createValidationError('Recipient phone number is required');
    }

    if (!message || typeof message !== 'string') {
      throw ErrorFactory.createValidationError('Message body is required');
    }

    const readEnvString = (key: string): string => {
      const anyEnv = Env as { get?: (k: string, d?: string) => string };
      const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get(key, '') : '';
      if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
      if (typeof process !== 'undefined') {
        const raw = process.env?.[key];
        if (typeof raw === 'string') return raw;
      }
      return fromEnv ?? '';
    };

    const apiKey = readEnvString('TERMII_API_KEY') || Env.TERMII_API_KEY;
    const sender = readEnvString('TERMII_SENDER') || Env.TERMII_SENDER;

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

    // Use global fetch — tests will mock this
    const url = 'https://api.termii.com/sms/send';
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw ErrorFactory.createTryCatchError(`Termii request failed (${res.status})`, {
        status: res.status,
        body: txt,
      });
    }

    const json = await res.json().catch(() => ({}));
    return json;
  },
});

export default TermiiDriver;
