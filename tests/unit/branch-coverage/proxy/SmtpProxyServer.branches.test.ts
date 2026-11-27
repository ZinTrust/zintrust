/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  env: {} as Record<string, any>,
  signingConfig: {
    keyId: 'kid',
    secret: 'secret',
    requireSigning: false,
    signingWindowMs: 60000,
  } as any,
  headers: { 'x-zt-key-id': 'kid' } as Record<string, string>,
  verifyResult: { ok: true } as any,
  shouldVerify: false,
  smtpSend: vi.fn(async () => undefined),
  capturedBackend: null as any,
  capturedVerify: null as any,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  emitMail: vi.fn(),
  signingService: {
    shouldVerify: vi.fn(() => false),
    normalizeConfig: vi.fn((config: any) => config),
  } as any,
}));

vi.mock('@config/env', () => {
  const Env = new Proxy(
    {
      get: (key: string, fallback?: string) => {
        const value = H.env[key];
        return value === undefined ? (fallback ?? '') : (value as string);
      },
      getInt: (key: string, fallback: number) => {
        const value = H.env[key];
        const parsed = value === undefined ? Number.NaN : Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      },
    },
    {
      get(target: Record<string, unknown>, key: string | symbol) {
        if (key in target) return target[key as string];
        return H.env[key as string];
      },
    }
  );
  return { Env };
});

vi.mock('@config/logger', () => ({ Logger: H.logger }));

vi.mock('@mail/drivers/Smtp', () => ({ SmtpDriver: { send: H.smtpSend } }));

vi.mock('@proxy/ProxySigningConfigResolver', () => ({
  resolveProxySigningConfig: () => H.signingConfig,
}));

vi.mock('@proxy/ProxySigningRequest', () => ({
  extractSigningHeaders: vi.fn(() => H.headers),
  verifyProxySignatureIfNeeded: vi.fn(async () => H.verifyResult),
}));

vi.mock('@proxy/SigningService', () => ({ SigningService: H.signingService }));

vi.mock('@proxy/ProxyServer', () => ({
  createProxyServer: vi.fn((input: any) => {
    H.capturedBackend = input.backend;
    H.capturedVerify = input.verify;
    return { start: vi.fn(async () => undefined) };
  }),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: { emitMail: H.emitMail },
}));

import { SmtpProxyServer } from '@proxy/smtp/SmtpProxyServer';

const validMessage = () => ({
  to: 'to@example.com',
  from: { email: 'from@example.com' },
  subject: 'subject',
  text: 'body',
});

const post = (body: unknown, path = '/zin/smtp/send', method = 'POST') => ({
  method,
  path,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const startValid = async (extra: Record<string, unknown> = {}): Promise<void> => {
  await SmtpProxyServer.start({
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    ...extra,
  });
};

describe('SmtpProxyServer uncovered branches', () => {
  beforeEach(() => {
    H.env = {};
    H.signingConfig = {
      keyId: 'kid',
      secret: 'secret',
      requireSigning: false,
      signingWindowMs: 60000,
    };
    H.headers = { 'x-zt-key-id': 'kid' };
    H.verifyResult = { ok: true };
    H.shouldVerify = false;
    H.signingService.shouldVerify.mockImplementation(() => H.shouldVerify);
    H.signingService.normalizeConfig = vi.fn((config: any) => config);
    H.capturedBackend = null;
    H.capturedVerify = null;
    H.smtpSend.mockReset();
    H.smtpSend.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes all secure variants and resolves proxy config from overrides and env', async () => {
    const secureValues: unknown[] = [
      true,
      false,
      'starttls',
      'STARTTLS',
      '',
      'tls',
      'ssl',
      'smtps',
      'implicit',
      'true',
      '1',
      'yes',
      'y',
      'false',
      '0',
      'no',
      'n',
      'unknown',
      42,
    ];
    for (const secure of secureValues) {
      await startValid({ smtpSecure: secure });
    }

    H.env = {
      SMTP_PROXY_HOST: 'env-proxy',
      SMTP_PROXY_PORT: 9999,
      SMTP_PROXY_MAX_BODY_BYTES: 2048,
      MAIL_HOST: 'env-smtp',
      MAIL_PORT: 2525,
    };
    await SmtpProxyServer.start();

    await startValid({
      host: 'override-proxy',
      port: 1234,
      maxBodyBytes: 4096,
    });
    expect(H.capturedBackend).toBeTruthy();
  });

  it('throws config errors for missing host, invalid port and partial credentials', async () => {
    await expect(SmtpProxyServer.start({ smtpHost: '' })).rejects.toThrow(/missing MAIL_HOST/);
    await expect(SmtpProxyServer.start({ smtpHost: 'h', smtpPort: 0 })).rejects.toThrow(
      /MAIL_PORT must be a positive integer/
    );
    await expect(
      SmtpProxyServer.start({ smtpHost: 'h', smtpUsername: 'user' })
    ).rejects.toThrow(/both MAIL_USERNAME and MAIL_PASSWORD/);
    await expect(
      SmtpProxyServer.start({ smtpHost: 'h', smtpPassword: 'pass' })
    ).rejects.toThrow(/both MAIL_USERNAME and MAIL_PASSWORD/);

    H.env['MAIL_USERNAME'] = null;
    await startValid();
    expect(H.capturedBackend).toBeTruthy();
  });

  it('validates attachment payloads and decodes base64 content', async () => {
    await startValid();

    expect(
      (await H.capturedBackend.handle(post({ message: { ...validMessage(), attachments: [42] } }))).status
    ).toBe(400);
    expect(
      (await H.capturedBackend.handle(post({ message: { ...validMessage(), attachments: [{}] } }))).status
    ).toBe(400);
    expect(
      (
        await H.capturedBackend.handle(
          post({ message: { ...validMessage(), attachments: [{ filename: 'a.txt' }] } })
        )
      ).status
    ).toBe(400);

    H.smtpSend.mockResolvedValueOnce(undefined);
    const ok = await H.capturedBackend.handle(
      post({
        message: {
          ...validMessage(),
          attachments: [{ filename: 'a.txt', contentBase64: 'aGVsbG8=' }],
        },
      })
    );
    expect(ok.status).toBe(200);
    expect(H.smtpSend.mock.calls[0]?.[1].attachments[0].content.toString()).toBe('hello');
  });

  it('validates to, from, html and attachments variants', async () => {
    await startValid();

    expect(
      (await H.capturedBackend.handle(post({ message: { ...validMessage(), to: 42 } }))).status
    ).toBe(400);

    const arrayRecipients = await H.capturedBackend.handle(
      post({ message: { ...validMessage(), to: ['a@b.com', 'c@d.com'] } })
    );
    expect(arrayRecipients.status).toBe(200);
    expect(H.emitMail.mock.calls[0]?.[0]).toBe('a@b.com, c@d.com');

    expect(
      (await H.capturedBackend.handle(post({ message: { ...validMessage(), from: 'bad' } }))).status
    ).toBe(400);
    expect(
      (await H.capturedBackend.handle(post({ message: { ...validMessage(), from: {} } }))).status
    ).toBe(400);

    const withName = await H.capturedBackend.handle(
      post({ message: { ...validMessage(), from: { email: 'from@example.com', name: 'Name' } } })
    );
    expect(withName.status).toBe(200);
    expect(H.smtpSend.mock.calls[H.smtpSend.mock.calls.length - 1]?.[1].from.name).toBe('Name');

    expect(
      (await H.capturedBackend.handle(post({ message: { ...validMessage(), html: 42 } }))).status
    ).toBe(400);
    expect(
      (
        await H.capturedBackend.handle(
          post({ message: { ...validMessage(), attachments: 'not-an-array' } })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await H.capturedBackend.handle(
          post({
            message: {
              ...validMessage(),
              attachments: [
                { filename: 'a.txt', contentBase64: 'aGk=' },
                { filename: 'bad.txt' },
              ],
            },
          })
        )
      ).status
    ).toBe(400);

    const withHtml = await H.capturedBackend.handle(
      post({ message: { ...validMessage(), html: '<p>hi</p>', attachments: [] } })
    );
    expect(withHtml.status).toBe(200);
    expect(H.smtpSend.mock.calls[H.smtpSend.mock.calls.length - 1]?.[1].attachments).toEqual([]);
  });

  it('validates message, subject, text and request-level early returns', async () => {
    await startValid();

    expect((await H.capturedBackend.handle(post(null))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({}))).status).toBe(400);
    expect((await H.capturedBackend.handle(post({ message: validMessage() }, '/zin/smtp/send', 'GET'))).status).toBe(405);
    expect((await H.capturedBackend.handle(post({ message: validMessage() }, '/zin/smtp/other'))).status).toBe(404);
    expect((await H.capturedBackend.handle(post('{'))).status).toBe(400);

    for (const subject of [undefined, '', '   ', 42]) {
      expect(
        (
          await H.capturedBackend.handle(
            post({ message: { ...validMessage(), subject } })
          )
        ).status
      ).toBe(400);
    }
    for (const text of [undefined, '', '   ', 42]) {
      expect(
        (await H.capturedBackend.handle(post({ message: { ...validMessage(), text } }))).status
      ).toBe(400);
    }

    H.smtpSend.mockRejectedValueOnce(new Error('smtp down'));
    expect((await H.capturedBackend.handle(post({ message: validMessage() }))).status).toBe(500);
  });

  it('maps signature verification outcomes and normalizer availability', async () => {
    await startValid();
    const req = { headers: {} } as any;

    H.shouldVerify = false;
    expect(await H.capturedVerify(req, '{}')).toEqual({ ok: true });

    H.shouldVerify = true;
    H.verifyResult = { ok: false, error: { status: 403, message: 'bad signature' } };
    expect(await H.capturedVerify(req, '{}')).toEqual({
      ok: false,
      status: 403,
      message: 'bad signature',
    });

    H.verifyResult = { ok: false };
    expect(await H.capturedVerify(req, '{}')).toEqual({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });

    delete H.signingService.normalizeConfig;
    expect(await H.capturedVerify(req, '{}')).toEqual({
      ok: false,
      status: 401,
      message: 'Unauthorized',
    });

    H.verifyResult = { ok: true };
    expect(await H.capturedVerify(req, '{}')).toEqual({ ok: true });
  });
});
