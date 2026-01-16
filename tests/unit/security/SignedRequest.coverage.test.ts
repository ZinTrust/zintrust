import { describe, expect, it, vi } from 'vitest';

describe('SignedRequest coverage', () => {
  it('throws when WebCrypto is unavailable', async () => {
    const originalCrypto = (globalThis as any).crypto;
    vi.stubGlobal('crypto', undefined);

    const { SignedRequest } = await import('@security/SignedRequest');

    await expect(
      SignedRequest.createHeaders({
        method: 'POST',
        url: 'https://example.com',
        keyId: 'key',
        secret: 'secret',
      })
    ).rejects.toThrow('WebCrypto is not available in this runtime');

    vi.stubGlobal('crypto', originalCrypto);
  });
});
