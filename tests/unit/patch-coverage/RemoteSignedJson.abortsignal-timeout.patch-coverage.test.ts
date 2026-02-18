import { describe, expect, it } from 'vitest';

describe('patch coverage: RemoteSignedJson AbortSignal.timeout requirement', () => {
  it('throws a config error when AbortSignal.timeout is unavailable but timeoutMs > 0', async () => {
    const original = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout;

    try {
      (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout = undefined;

      const { RemoteSignedJson } = await import('@/common/RemoteSignedJson');

      await expect(
        RemoteSignedJson.request(
          {
            baseUrl: 'https://proxy.example.test',
            keyId: 'kid',
            secret: 'secret',
            timeoutMs: 1000,
            missingUrlMessage: 'missing',
            missingCredentialsMessage: 'missing',
            messages: {
              unauthorized: 'u',
              forbidden: 'f',
              rateLimited: 'r',
              rejected: 'rej',
              error: 'e',
              timedOut: 't',
            },
          },
          '/zin/kv/get',
          { a: 1 }
        )
      ).rejects.toThrow(/AbortSignal\.timeout/);
    } finally {
      (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout = original;
    }
  });
});
