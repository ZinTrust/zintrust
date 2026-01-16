import { describe, expect, it, vi } from 'vitest';

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

    const { RemoteSignedJson } = await import('@common/RemoteSignedJson');

    const result = await RemoteSignedJson.request(
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
