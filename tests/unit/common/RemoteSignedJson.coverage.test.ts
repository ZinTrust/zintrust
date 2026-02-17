import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    createHeaders: vi.fn(async () => ({})),
  },
}));

vi.mock('@proxy/SigningService', () => ({
  normalizeSigningCredentials: (creds: { keyId: string; secret: string }) => creds,
}));

import { RemoteSignedJson } from '@common/RemoteSignedJson';

const settings = {
  baseUrl: 'https://example.test',
  keyId: 'kid',
  secret: 'secret',
  timeoutMs: 1,
  missingUrlMessage: 'missing-url',
  missingCredentialsMessage: 'missing-creds',
  messages: {
    unauthorized: 'unauth',
    forbidden: 'forbidden',
    rateLimited: 'rate-limited',
    rejected: 'rejected',
    error: 'proxy error',
    timedOut: 'timed out',
  },
} as const;

describe('RemoteSignedJson (coverage extras)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enriches 5xx errors with code+message (CODE: message)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ body: { code: 'X', message: 'bad' } }), { status: 500 })
      )
    );

    await expect(RemoteSignedJson.request(settings, '/zin/test', { a: 1 })).rejects.toThrow(
      /proxy error \(X: bad\)/
    );
  });

  it('enriches 5xx errors with code only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ body: { code: 'ONLY' } }), { status: 500 }))
    );

    await expect(RemoteSignedJson.request(settings, '/zin/test', { a: 1 })).rejects.toThrow(
      /proxy error \(ONLY\)/
    );
  });

  it('enriches 5xx errors with message only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ body: { message: 'just message' } }), { status: 500 })
      )
    );

    await expect(RemoteSignedJson.request(settings, '/zin/test', { a: 1 })).rejects.toThrow(
      /proxy error \(just message\)/
    );
  });

  it('does not enrich when response body is not the expected shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('plain text', { status: 500 }))
    );

    await expect(RemoteSignedJson.request(settings, '/zin/test', { a: 1 })).rejects.toThrow(
      /proxy error(?! \()/
    );
  });
});

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    createHeaders: vi.fn().mockResolvedValue({}),
  },
}));

describe('RemoteSignedJson coverage', () => {
  it('returns text payload when JSON parse fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'plain-text',
    }));

    (globalThis as any).fetch = fetchMock;

    const { RemoteSignedJson: RemoteSignedJsonDynamic } = await import('@common/RemoteSignedJson');

    const result = await RemoteSignedJsonDynamic.request(
      {
        baseUrl: 'https://example.com',
        keyId: 'key',
        secret: 'secret',
        timeoutMs: 1000,
        missingUrlMessage: 'missing url',
        missingCredentialsMessage: 'missing creds',
        messages: {
          unauthorized: 'unauthorized',
          forbidden: 'forbidden',
          rateLimited: 'rate',
          rejected: 'rejected',
          error: 'error',
          timedOut: 'timeout',
        },
      },
      '/path',
      { ok: true }
    );

    expect(result).toEqual({ message: 'plain-text' });
  });
});
