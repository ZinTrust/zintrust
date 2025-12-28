import { ErrorFactory } from '@exceptions/ZintrustError';

export type MailgunConfig = {
  apiKey: string;
  domain: string;
  baseUrl?: string;
};

export type MailAddress = {
  email: string;
  name?: string;
};

export type MailAttachment = { filename: string; content: Buffer };

export type MailMessage = {
  to: string | string[];
  from: MailAddress;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

export type SendResult = {
  ok: boolean;
  provider: 'mailgun';
  messageId?: string;
};

const normalizeRecipients = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

const base64 = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

const toArrayBuffer = (buf: Buffer): ArrayBuffer => {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
};

const normalizeBaseUrl = (value?: string): string => {
  let v = (value ?? '').trim();
  if (v === '') return 'https://api.mailgun.net';

  // Avoid regex backtracking (Sonar S5852) by trimming trailing slashes in linear time.
  while (v.endsWith('/')) v = v.slice(0, -1);

  return v;
};

const ensureConfig = (
  config: MailgunConfig
): Required<Pick<MailgunConfig, 'apiKey' | 'domain'>> & {
  baseUrl: string;
} => {
  const apiKey = (config.apiKey ?? '').trim();
  const domain = (config.domain ?? '').trim();
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  if (apiKey === '') throw ErrorFactory.createConfigError('Mailgun: missing MAILGUN_API_KEY');
  if (domain === '') throw ErrorFactory.createConfigError('Mailgun: missing MAILGUN_DOMAIN');

  return { apiKey, domain, baseUrl };
};

const ensureMessage = (message: MailMessage): void => {
  if (message.from.email.trim() === '') {
    throw ErrorFactory.createConfigError('Mail: missing from.email');
  }
};

export const MailgunDriver = Object.freeze({
  async send(config: MailgunConfig, message: MailMessage): Promise<SendResult> {
    const { apiKey, domain, baseUrl } = ensureConfig(config);
    ensureMessage(message);

    const url = `${baseUrl}/v3/${encodeURIComponent(domain)}/messages`;

    const form = new FormData();

    const fromName = (message.from.name ?? '').trim();
    const from = fromName === '' ? message.from.email : `${fromName} <${message.from.email}>`;

    form.set('from', from);
    form.set('to', normalizeRecipients(message.to).join(','));
    form.set('subject', message.subject);
    form.set('text', message.text);

    if (typeof message.html === 'string' && message.html !== '') {
      form.set('html', message.html);
    }

    if (message.attachments && message.attachments.length > 0) {
      for (const a of message.attachments) {
        // In Node.js, Buffer is a Uint8Array, which works as a BlobPart.
        // In other runtimes, callers typically won't supply Buffer attachments.
        const blob = new Blob([toArrayBuffer(a.content)]);
        form.append('attachment', blob, a.filename);
      }
    }

    const auth = `Basic ${base64('api:' + apiKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
      },
      body: form,
    });

    if (res.ok) {
      try {
        const json = (await res.json()) as Record<string, unknown>;
        const id = typeof json?.['id'] === 'string' ? json['id'] : undefined;
        return { ok: true, provider: 'mailgun', messageId: id };
      } catch {
        return { ok: true, provider: 'mailgun' };
      }
    }

    const text = await res.text();
    throw ErrorFactory.createConnectionError(`Mailgun send failed (${res.status})`, {
      status: res.status,
      body: text,
    });
  },
});

export default MailgunDriver;
