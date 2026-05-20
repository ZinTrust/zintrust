import { ErrorFactory } from '@exceptions/ZintrustError';
import { isArray, isNonEmptyString, isObject } from '@helper/index';
import { readAndVerifyJson, toErrorResponse } from '@proxy/CloudflareProxyShared';
import { RequestValidator } from '@proxy/RequestValidator';
import {
  buildRfc2822Message,
  type MailAttachment,
  type MailMessage,
} from '@tools/mail/MailMessage';

type SendEmailBinding = {
  send: (message: unknown) => Promise<unknown>;
};

type CloudflareEmailModule = {
  EmailMessage: new (from: string, to: string, raw: string) => unknown;
};

type EmailProxyEnv = {
  APP_KEY?: string;
  MAIL_CLOUDFLARE_PROXY_SECRET?: string;
  MAIL_CLOUDFLARE_BINDING?: string;
  SEND_EMAIL?: SendEmailBinding;
  SEB?: SendEmailBinding;
  ZT_NONCES?: unknown;
  ZT_PROXY_SIGNING_WINDOW_MS?: string;
  ZT_MAX_BODY_BYTES?: string;
} & Record<string, unknown>;

type AttachmentPayload = {
  filename: string;
  contentBase64: string;
};

const DEFAULT_SIGNING_WINDOW_MS = 60_000;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024;

const normalizeRecipients = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

const importCloudflareEmail = async (): Promise<CloudflareEmailModule> => {
  try {
    return (await import('cloudflare:email')) as CloudflareEmailModule;
  } catch {
    throw ErrorFactory.createConfigError('Cloudflare email runtime API is unavailable');
  }
};

const resolveBinding = (
  env: EmailProxyEnv,
  requestedBinding: string | undefined
): SendEmailBinding => {
  const candidateNames = [
    requestedBinding,
    env.MAIL_CLOUDFLARE_BINDING,
    'SEND_EMAIL',
    'SEB',
  ].filter(
    (value, index, values): value is string =>
      typeof value === 'string' && value.trim() !== '' && values.indexOf(value) === index
  );

  for (const name of candidateNames) {
    const binding = env[name] as SendEmailBinding | undefined;
    if (binding !== undefined && typeof binding.send === 'function') return binding;
  }

  throw ErrorFactory.createConfigError(
    `Missing Cloudflare send_email binding (tried: ${candidateNames.length > 0 ? candidateNames.join(', ') : 'none'})`
  );
};

const decodeAttachment = (payload: AttachmentPayload): MailAttachment => ({
  filename: payload.filename,
  content: Buffer.from(payload.contentBase64, 'base64'),
});

const parseAttachments = (value: unknown): MailAttachment[] | undefined => {
  if (value === undefined) return undefined;
  if (!isArray(value)) throw ErrorFactory.createValidationError('attachments must be an array');

  return value.map((entry) => {
    if (!isObject(entry)) {
      throw ErrorFactory.createValidationError('attachments entries must be objects');
    }
    const filename = entry['filename'];
    const contentBase64 = entry['contentBase64'];
    if (!isNonEmptyString(filename)) {
      throw ErrorFactory.createValidationError('attachment filename is required');
    }
    if (!isNonEmptyString(contentBase64)) {
      throw ErrorFactory.createValidationError('attachment contentBase64 is required');
    }
    return decodeAttachment({ filename, contentBase64 });
  });
};

const parseMessage = (payload: unknown): MailMessage => {
  if (!isObject(payload)) throw ErrorFactory.createValidationError('message is required');

  const fromRaw = payload['from'];
  if (!isObject(fromRaw) || !isNonEmptyString(fromRaw['email'])) {
    throw ErrorFactory.createValidationError('message.from.email is required');
  }

  const toRaw = payload['to'];
  if (
    !isNonEmptyString(payload['subject']) ||
    !isNonEmptyString(payload['text']) ||
    !(isNonEmptyString(toRaw) || (isArray(toRaw) && toRaw.every((item) => isNonEmptyString(item))))
  ) {
    throw ErrorFactory.createValidationError(
      'message.to, message.subject, and message.text are required'
    );
  }

  return {
    to: toRaw as string | string[],
    from: {
      email: fromRaw['email'],
      name: isNonEmptyString(fromRaw['name']) ? fromRaw['name'] : undefined,
    },
    subject: payload['subject'],
    text: payload['text'],
    html: isNonEmptyString(payload['html']) ? payload['html'] : undefined,
    attachments: parseAttachments(payload['attachments']),
  };
};

const handleSend = async (request: Request, env: EmailProxyEnv): Promise<Response> => {
  const check = await readAndVerifyJson(request, env, {
    secretEnvVar: 'MAIL_CLOUDFLARE_PROXY_SECRET',
    missingSecretStatus: 401,
    missingSecretMessage: 'Missing signing secret (MAIL_CLOUDFLARE_PROXY_SECRET or APP_KEY)',
    defaultSigningWindowMs: DEFAULT_SIGNING_WINDOW_MS,
    defaultMaxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  });
  if (!check.ok) return check.response;

  try {
    const payload = check.payload;
    if (!isObject(payload)) {
      return toErrorResponse(400, 'VALIDATION_ERROR', 'Invalid body');
    }

    const message = parseMessage(payload['message']);
    const requestedBinding = isNonEmptyString(payload['binding']) ? payload['binding'] : undefined;
    const binding = resolveBinding(env, requestedBinding);
    const { EmailMessage } = await importCloudflareEmail();
    const raw = buildRfc2822Message(message);

    await Promise.all(
      normalizeRecipients(message.to).map(async (recipient) =>
        binding.send(new EmailMessage(message.from.email, recipient, raw))
      )
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email send failed';
    return toErrorResponse(500, 'EMAIL_SEND_ERROR', message);
  }
};

export const ZintrustEmailProxy = Object.freeze({
  _ZINTRUST_CLOUDFLARE_EMAIL_PROXY_VERSION: '0.1.15',
  _ZINTRUST_CLOUDFLARE_EMAIL_PROXY_BUILD_DATE: '__BUILD_DATE__',
  async fetch(request: Request, env: EmailProxyEnv): Promise<Response> {
    const url = new URL(request.url);

    const methodError = RequestValidator.requirePost(request.method);
    if (methodError !== null) {
      return toErrorResponse(405, methodError.code, 'Method not allowed');
    }

    if (url.pathname === '/zin/mail/cloudflare/send') {
      return handleSend(request, env);
    }

    return toErrorResponse(404, 'NOT_FOUND', 'Not found');
  },
});

export default ZintrustEmailProxy;
