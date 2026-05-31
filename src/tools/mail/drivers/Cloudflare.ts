import { RemoteSignedJson, type RemoteSignedJsonSettings } from '@common/RemoteSignedJson';
import { Cloudflare } from '@config/cloudflare';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { parseCustomHeadersFromEnv } from '@orm/adapters/SqlProxyAdapterUtils';

import { buildRfc2822Message, type MailAddress, type MailMessage } from '@tools/mail/MailMessage';

export type CloudflareMailConfig = {
  driver: 'cl';
  binding: string;
};

type SendEmailBinding = {
  send: (message: unknown) => Promise<unknown>;
};

type CloudflareEmailModule = {
  EmailMessage: new (from: string, to: string, raw: string) => unknown;
};

type AttachmentPayload = {
  filename: string;
  contentBase64: string;
};

type ProxyMessagePayload = {
  to: string | string[];
  from: MailAddress;
  subject: string;
  text: string;
  html?: string;
  attachments?: AttachmentPayload[];
};

type ProxySendResponse = {
  ok: boolean;
  messageId?: string;
};

const MAIL_PROXY_KEY_ID_ENV = 'MAIL_CLOUDFLARE_PROXY_KEY_ID';
const MAIL_PROXY_SECRET_ENV = ['MAIL_CLOUDFLARE_PROXY', 'SECRET'].join('_');
const APP_KEY_ID_ENV = 'APP_NAME';
const APP_SECRET_ENV = ['APP', 'KEY'].join('_');

const createMissingMailProxyCredentialsMessage = (): string => {
  return `Cloudflare mail proxy signing credentials are missing (${MAIL_PROXY_KEY_ID_ENV} / ${MAIL_PROXY_SECRET_ENV}). Fallbacks: ${APP_KEY_ID_ENV} and ${APP_SECRET_ENV}.`;
};

const resolveSigningPrefix = (baseUrl: string): string | undefined => {
  try {
    const parsed = new URL(baseUrl);
    const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    if (path === '' || path === '/') return undefined;
    return path;
  } catch {
    return undefined;
  }
};

const normalizeRecipients = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

const shouldUseProxy = (): boolean => Env.get('MAIL_CLOUDFLARE_PROXY_URL', '').trim() !== '';

const createRemoteConfig = (): RemoteSignedJsonSettings => {
  const baseUrl = Env.get('MAIL_CLOUDFLARE_PROXY_URL', '');
  const timeoutMs = Env.getInt(
    'MAIL_CLOUDFLARE_PROXY_TIMEOUT_MS',
    Env.getInt('ZT_PROXY_TIMEOUT_MS', Env.REQUEST_TIMEOUT)
  );

  return {
    baseUrl,
    keyId: Env.get('MAIL_CLOUDFLARE_PROXY_KEY_ID', ''),
    secret: Env.get('MAIL_CLOUDFLARE_PROXY_SECRET', ''),
    timeoutMs,
    signaturePathPrefixToStrip: resolveSigningPrefix(baseUrl),
    customHeaders: parseCustomHeadersFromEnv('MAIL_CLOUDFLARE_PROXY'),
    missingUrlMessage: 'Cloudflare mail proxy URL is missing (MAIL_CLOUDFLARE_PROXY_URL)',
    missingCredentialsMessage: createMissingMailProxyCredentialsMessage(),
    messages: {
      unauthorized: 'Cloudflare mail proxy unauthorized',
      forbidden: 'Cloudflare mail proxy forbidden',
      rateLimited: 'Cloudflare mail proxy rate limited',
      rejected: 'Cloudflare mail proxy rejected request',
      error: 'Cloudflare mail proxy error',
      timedOut: 'Cloudflare mail proxy request timed out',
    },
  };
};

const serializeMessage = (message: MailMessage): ProxyMessagePayload => ({
  to: message.to,
  from: message.from,
  subject: message.subject,
  text: message.text,
  html: message.html,
  attachments: message.attachments?.map((attachment) => ({
    filename: attachment.filename,
    contentBase64: attachment.content.toString('base64'),
  })),
});

const sendViaProxy = async (
  config: CloudflareMailConfig,
  message: MailMessage
): Promise<{ ok: boolean; messageId?: string }> => {
  const response = await RemoteSignedJson.request<ProxySendResponse>(
    createRemoteConfig(),
    '/zin/mail/cloudflare/send',
    {
      binding: config.binding,
      message: serializeMessage(message),
    }
  );

  return {
    ok: response.ok === true,
    messageId: response.messageId,
  };
};

const resolveBinding = (config: CloudflareMailConfig): SendEmailBinding => {
  const env = Cloudflare.getWorkersEnv();

  if (env === null) {
    throw ErrorFactory.createConfigError(
      'Cloudflare mail driver requires a Cloudflare Workers runtime with a send_email binding'
    );
  }

  const candidateNames = [config.binding, 'SEND_EMAIL', 'SEB'].filter(
    (name, index, all) => name.trim() !== '' && all.indexOf(name) === index
  );

  for (const name of candidateNames) {
    const binding = env[name] as SendEmailBinding | undefined;
    if (binding !== undefined && typeof binding.send === 'function') return binding;
  }

  throw ErrorFactory.createConfigError(
    `Cloudflare mail binding not found. Set MAIL_CLOUDFLARE_BINDING to a Wrangler send_email binding name (tried: ${candidateNames.join(', ')})`
  );
};

const importCloudflareEmail = async (): Promise<CloudflareEmailModule> => {
  try {
    return (await import('cloudflare:email')) as CloudflareEmailModule;
  } catch {
    throw ErrorFactory.createConfigError(
      'Cloudflare mail driver could not load the cloudflare:email runtime API'
    );
  }
};

export const CloudflareDriver = Object.freeze({
  async send(
    config: CloudflareMailConfig,
    message: MailMessage
  ): Promise<{ ok: boolean; messageId?: string }> {
    const from = message.from.email.trim();
    if (from === '') {
      throw ErrorFactory.createConfigError('Cloudflare mail driver requires from.email');
    }

    const recipients = normalizeRecipients(message.to)
      .map((recipient) => recipient.trim())
      .filter((recipient) => recipient !== '');

    if (recipients.length === 0) {
      throw ErrorFactory.createConfigError(
        'Cloudflare mail driver requires at least one recipient'
      );
    }

    if (shouldUseProxy()) {
      return sendViaProxy(config, message);
    }

    const binding = resolveBinding(config);
    const { EmailMessage } = await importCloudflareEmail();
    const raw = buildRfc2822Message(message);

    await Promise.all(
      recipients.map(async (recipient) => binding.send(new EmailMessage(from, recipient, raw)))
    );

    return { ok: true };
  },
});

export default CloudflareDriver;
