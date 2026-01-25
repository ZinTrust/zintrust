import { MIME_TYPES } from '@/config/constants';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type SendGridConfig = {
  apiKey: string;
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
  provider: 'sendgrid';
  messageId?: string;
};

const normalizeRecipients = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

export const SendGridDriver = Object.freeze({
  async send(config: SendGridConfig, message: MailMessage): Promise<SendResult> {
    if (config.apiKey.trim() === '') {
      throw ErrorFactory.createConfigError('SendGrid: missing SENDGRID_API_KEY');
    }

    if (message.from.email.trim() === '') {
      throw ErrorFactory.createConfigError('Mail: missing from.email');
    }

    const personalizations = [
      {
        to: normalizeRecipients(message.to).map((email) => ({ email })),
      },
    ];

    const content: Array<{ type: string; value: string }> = [
      { type: MIME_TYPES.TEXT, value: message.text },
    ];
    if (typeof message.html === 'string' && message.html !== '') {
      content.push({ type: MIME_TYPES.HTML, value: message.html });
    }

    type SendGridAttachment = { content: string; filename: string };

    const body: {
      personalizations: Array<Record<string, unknown>>;
      from: { email: string; name?: string };
      subject: string;
      content: Array<{ type: string; value: string }>;
      attachments?: SendGridAttachment[];
    } = {
      personalizations,
      from: {
        email: message.from.email,
        name: message.from.name?.trim() === '' ? undefined : message.from.name,
      },
      subject: message.subject,
      content,
    };

    if (message.attachments && message.attachments.length > 0) {
      body.attachments = message.attachments.map((a) => ({
        content: a.content.toString('base64'),
        filename: a.filename,
      }));
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'content-type': MIME_TYPES.JSON,
      },
      body: JSON.stringify(body),
    });

    // SendGrid typically returns 202 for success.
    if (res.status === 202) {
      const messageId = res.headers.get('x-message-id') ?? undefined;
      return { ok: true, provider: 'sendgrid', messageId };
    }

    const text = await res.text();
    throw ErrorFactory.createConnectionError(`SendGrid send failed (${res.status})`, {
      status: res.status,
      body: text,
    });
  },
});

export default SendGridDriver;
