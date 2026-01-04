import { ErrorFactory } from '@zintrust/core';

export type NodemailerMailConfig = {
  driver: 'nodemailer';
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean | 'starttls';
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

type NodemailerTransport = {
  sendMail: (options: unknown) => Promise<{ messageId?: unknown }>;
};

async function importNodemailer(): Promise<{
  createTransport: (options: unknown) => NodemailerTransport;
}> {
  return (await import('nodemailer')) as unknown as {
    createTransport: (options: unknown) => NodemailerTransport;
  };
}

function normalizeRecipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

function formatFrom(from: MailAddress): string {
  const name = (from.name ?? '').trim();
  return name === '' ? from.email : `${name} <${from.email}>`;
}

function mapSecure(value: boolean | 'starttls'): { secure: boolean; requireTLS?: boolean } {
  if (value === 'starttls') return { secure: false, requireTLS: true };
  return { secure: Boolean(value) };
}

export const NodemailerDriver = Object.freeze({
  async send(
    config: NodemailerMailConfig,
    message: MailMessage
  ): Promise<{ ok: boolean; messageId?: string }> {
    const host = (config.host ?? '').trim();
    const port = Number(config.port);

    if (host === '') {
      throw ErrorFactory.createConfigError('Nodemailer: missing MAIL_HOST');
    }

    if (!Number.isFinite(port) || port <= 0) {
      throw ErrorFactory.createConfigError('Nodemailer: invalid MAIL_PORT');
    }

    if (message.from.email.trim() === '') {
      throw ErrorFactory.createConfigError('Mail: missing from.email');
    }

    const { createTransport } = await importNodemailer();
    const tls = mapSecure(config.secure);

    const authUser = (config.username ?? '').trim();
    const authPass = (config.password ?? '').trim();

    const transport = createTransport({
      host,
      port,
      secure: tls.secure,
      requireTLS: tls.requireTLS,
      auth: authUser === '' ? undefined : { user: authUser, pass: authPass },
    });

    const info = await transport.sendMail({
      from: formatFrom(message.from),
      to: normalizeRecipients(message.to).join(','),
      subject: message.subject,
      text: message.text,
      html: typeof message.html === 'string' && message.html !== '' ? message.html : undefined,
      attachments:
        message.attachments?.map((a) => ({ filename: a.filename, content: a.content })) ??
        undefined,
    });

    const messageId = typeof info?.messageId === 'string' ? info.messageId : undefined;
    return { ok: true, messageId };
  },
});

export default NodemailerDriver;
