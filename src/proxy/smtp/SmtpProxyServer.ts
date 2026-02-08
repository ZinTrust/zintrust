import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import {
  SmtpDriver,
  type MailAttachment,
  type MailMessage,
  type SmtpConfig,
} from '@mail/drivers/Smtp';
import { type IncomingMessage } from '@node-singletons/http';
import { ErrorHandler } from '@proxy/ErrorHandler';
import type { ProxyBackend, ProxyResponse } from '@proxy/ProxyBackend';
import type { ProxySigningConfig } from '@proxy/ProxyConfig';
import { createProxyServer } from '@proxy/ProxyServer';
import { RequestValidator } from '@proxy/RequestValidator';
import { SigningService } from '@proxy/SigningService';

type ProxyConfig = {
  host: string;
  port: number;
  maxBodyBytes: number;
  smtp: SmtpConfig;
  signing: ProxySigningConfig;
};

type ProxyOverrides = Partial<{
  host: string;
  port: number;
  maxBodyBytes: number;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean | 'starttls' | string;
  requireSigning: boolean;
  keyId: string;
  secret: string;
  signingWindowMs: number;
}>;

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

const normalizeHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value.join(',');
  return value;
};

const normalizeSecure = (value: unknown): boolean | 'starttls' | undefined => {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (raw === '') return undefined;
    if (raw === 'starttls') return 'starttls';
    if (['tls', 'ssl', 'smtps', 'implicit', 'true', '1', 'yes', 'y'].includes(raw)) return true;
    if (['false', '0', 'no', 'n'].includes(raw)) return false;
  }
  return undefined;
};

const resolveProxyConfig = (
  overrides: ProxyOverrides = {}
): {
  host: string;
  port: number;
  maxBodyBytes: number;
} => {
  const host = overrides.host ?? Env.get('SMTP_PROXY_HOST', Env.HOST ?? '127.0.0.1');
  const port = overrides.port ?? Env.getInt('SMTP_PROXY_PORT', Env.PORT ?? 8794);
  const maxBodyBytes =
    overrides.maxBodyBytes ?? Env.getInt('SMTP_PROXY_MAX_BODY_BYTES', Env.MAX_BODY_SIZE ?? 131072);

  return { host, port, maxBodyBytes };
};

const resolveSmtpConfig = (overrides: ProxyOverrides = {}): SmtpConfig => {
  const host = overrides.smtpHost ?? Env.get('MAIL_HOST', '');
  const port = overrides.smtpPort ?? Env.getInt('MAIL_PORT', 587);
  const username = overrides.smtpUsername ?? Env.get('MAIL_USERNAME', '');
  const password = overrides.smtpPassword ?? Env.get('MAIL_PASSWORD', '');
  const secureRaw = overrides.smtpSecure ?? Env.get('MAIL_SECURE', '');
  const secure = normalizeSecure(secureRaw) ?? false;

  return { host, port, username, password, secure };
};

const resolveSigningConfig = (
  overrides: ProxyOverrides = {}
): {
  keyId: string;
  secret: string;
  requireSigning: boolean;
  signingWindowMs: number;
} => {
  const keyId = overrides.keyId ?? Env.get('SMTP_PROXY_KEY_ID', '');
  const secretRaw = overrides.secret ?? Env.get('SMTP_PROXY_SECRET', '');
  const secret = secretRaw.trim() === '' ? Env.get('APP_KEY', '') : secretRaw;
  const requireSigningEnv = Env.getBool('SMTP_PROXY_REQUIRE_SIGNING', true);
  const hasCredentials = keyId.trim() !== '' && secret.trim() !== '';
  const requireSigning = requireSigningEnv ? hasCredentials : overrides.requireSigning === true;
  const signingWindowMs =
    overrides.signingWindowMs ?? Env.getInt('SMTP_PROXY_SIGNING_WINDOW_MS', 60000);

  return { keyId, secret, requireSigning, signingWindowMs };
};

const resolveConfig = (overrides: ProxyOverrides = {}): ProxyConfig => {
  const proxyConfig = resolveProxyConfig(overrides);
  const smtpConfig = resolveSmtpConfig(overrides);
  const signingConfig = resolveSigningConfig(overrides);

  return {
    host: proxyConfig.host,
    port: proxyConfig.port,
    maxBodyBytes: proxyConfig.maxBodyBytes,
    smtp: smtpConfig,
    signing: {
      keyId: signingConfig.keyId,
      secret: signingConfig.secret,
      require: signingConfig.requireSigning,
      windowMs: signingConfig.signingWindowMs,
    },
  };
};

const validateSmtpConfig = (config: SmtpConfig): void => {
  if (config.host.trim() === '') {
    throw ErrorFactory.createConfigError('SMTP proxy missing MAIL_HOST');
  }

  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw ErrorFactory.createConfigError('SMTP proxy MAIL_PORT must be a positive integer');
  }

  const username = config.username ?? '';
  const password = config.password ?? '';
  if (
    (username.trim() !== '' && password.trim() === '') ||
    (username.trim() === '' && password.trim() !== '')
  ) {
    throw ErrorFactory.createConfigError(
      'SMTP proxy requires both MAIL_USERNAME and MAIL_PASSWORD'
    );
  }
};

const verifySignatureIfNeeded = async (
  req: IncomingMessage,
  body: string,
  config: ProxyConfig
): Promise<{ ok: boolean; error?: { status: number; message: string } }> => {
  const headers: Record<string, string | undefined> = {
    'x-zt-key-id': normalizeHeaderValue(req.headers['x-zt-key-id']),
    'x-zt-timestamp': normalizeHeaderValue(req.headers['x-zt-timestamp']),
    'x-zt-nonce': normalizeHeaderValue(req.headers['x-zt-nonce']),
    'x-zt-body-sha256': normalizeHeaderValue(req.headers['x-zt-body-sha256']),
    'x-zt-signature': normalizeHeaderValue(req.headers['x-zt-signature']),
  };

  if (SigningService.shouldVerify(config.signing, headers)) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const verified = await SigningService.verify({
      method: req.method ?? 'POST',
      url,
      body,
      headers,
      signing: config.signing,
    });
    if (!verified.ok) {
      return { ok: false, error: { status: verified.status, message: verified.message } };
    }
  }

  return { ok: true };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseAttachment = (value: unknown): ParseResult<MailAttachment> => {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'attachments must be objects' },
    };
  }

  const filename = value['filename'];
  const contentBase64 = value['contentBase64'];

  if (typeof filename !== 'string' || filename.trim() === '') {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'attachment filename is required' },
    };
  }

  if (typeof contentBase64 !== 'string' || contentBase64.trim() === '') {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'attachment contentBase64 is required' },
    };
  }

  const content = Buffer.from(contentBase64, 'base64');
  return { ok: true, value: { filename, content } };
};

const parseTo = (value: unknown): ParseResult<MailMessage['to']> => {
  if (typeof value === 'string' || Array.isArray(value)) {
    return { ok: true, value: value as MailMessage['to'] };
  }
  return {
    ok: false,
    error: { code: 'VALIDATION_ERROR', message: 'to must be a string or array' },
  };
};

const parseFrom = (value: unknown): ParseResult<MailMessage['from']> => {
  if (!isRecord(value)) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'from is required' } };
  }

  const email = value['email'];
  const name = value['name'];
  if (typeof email !== 'string' || email.trim() === '') {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'from.email is required' } };
  }

  return {
    ok: true,
    value: {
      email,
      name: typeof name === 'string' && name.trim() !== '' ? name : undefined,
    },
  };
};

const parseHtml = (value: unknown): ParseResult<string | undefined> => {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === 'string') return { ok: true, value };
  return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'html must be a string' } };
};

const parseAttachments = (value: unknown): ParseResult<MailAttachment[] | undefined> => {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'attachments must be an array' },
    };
  }

  const attachments: MailAttachment[] = [];
  for (const entry of value) {
    const parsed = parseAttachment(entry);
    if (!parsed.ok) return parsed;
    attachments.push(parsed.value);
  }

  return { ok: true, value: attachments };
};

const parseMessagePayload = (payload: Record<string, unknown>): ParseResult<MailMessage> => {
  const messageRaw = payload['message'];
  if (!isRecord(messageRaw)) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'message is required' } };
  }

  const toParsed = parseTo(messageRaw['to']);
  if (!toParsed.ok) return toParsed;

  const fromParsed = parseFrom(messageRaw['from']);
  if (!fromParsed.ok) return fromParsed;

  const subject = messageRaw['subject'];
  if (typeof subject !== 'string' || subject.trim() === '') {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'subject is required' } };
  }

  const text = messageRaw['text'];
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'text is required' } };
  }

  const htmlParsed = parseHtml(messageRaw['html']);
  if (!htmlParsed.ok) return htmlParsed;

  const attachmentsParsed = parseAttachments(messageRaw['attachments']);
  if (!attachmentsParsed.ok) return attachmentsParsed;

  return {
    ok: true,
    value: {
      to: toParsed.value,
      from: fromParsed.value,
      subject,
      text,
      html: htmlParsed.value,
      attachments: attachmentsParsed.value,
    },
  };
};

const createBackend = (config: ProxyConfig): ProxyBackend => ({
  name: 'smtp',
  handle: async (request) => {
    const methodError = RequestValidator.requirePost(request.method);
    Logger.debug('[SmtpProxy] Received request', { path: request.path, method: request.method });
    if (methodError) {
      return ErrorHandler.toProxyError(405, methodError.code, methodError.message);
    }

    if (request.path !== '/zin/smtp/send') {
      Logger.warn('[SmtpProxy] 404 Not Found', { path: request.path });
      return ErrorHandler.toProxyError(404, 'NOT_FOUND', 'Unknown endpoint');
    }

    const parsed = RequestValidator.parseJson(request.body);
    if (!parsed.ok) {
      return ErrorHandler.toProxyError(400, parsed.error.code, parsed.error.message);
    }

    const messageValidation = parseMessagePayload(parsed.value);
    if (!messageValidation.ok) {
      return ErrorHandler.toProxyError(
        400,
        messageValidation.error.code,
        messageValidation.error.message
      );
    }

    try {
      Logger.debug('[SmtpProxy] Sending email via SmtpDriver', { to: messageValidation.value.to });
      await SmtpDriver.send(config.smtp, messageValidation.value);
      Logger.debug('[SmtpProxy] Email sent successfully');
      return { status: 200, body: { ok: true } };
    } catch (error) {
      Logger.error('[SmtpProxy] Failed to send email', error);
      return ErrorHandler.toProxyError(500, 'SMTP_PROXY_ERROR', String(error));
    }
  },
  async health(): Promise<ProxyResponse> {
    try {
      validateSmtpConfig(config.smtp);
      await Promise.resolve();
      return { status: 200, body: { status: 'healthy' } };
    } catch (error) {
      return ErrorHandler.toProxyError(503, 'UNHEALTHY', String(error));
    }
  },
});

const createVerifier =
  (config: ProxyConfig) =>
  async (
    req: IncomingMessage,
    body: string
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
    const verified = await verifySignatureIfNeeded(req, body, config);
    if (!verified.ok && verified.error) {
      return { ok: false, status: verified.error.status, message: verified.error.message };
    }
    return { ok: true };
  };

export const SmtpProxyServer = Object.freeze({
  async start(overrides: ProxyOverrides = {}): Promise<void> {
    const config = resolveConfig(overrides);
    validateSmtpConfig(config.smtp);

    try {
      Logger.info(
        `SMTP proxy config: proxyHost=${config.host} proxyPort=${config.port} smtpHost=${String(
          config.smtp.host
        )} smtpPort=${String(config.smtp.port)} smtpUser=${String(config.smtp.username ?? '')}`
      );
    } catch {
      // noop
    }

    const backend = createBackend(config);

    const server = createProxyServer({
      host: config.host,
      port: config.port,
      maxBodyBytes: config.maxBodyBytes,
      backend,
      verify: createVerifier(config),
    });

    await server.start();
    Logger.info(`SMTP proxy listening on http://${config.host}:${config.port}`);
  },
});

export default SmtpProxyServer;
