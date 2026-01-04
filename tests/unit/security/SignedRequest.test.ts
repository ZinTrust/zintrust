import { describe, expect, it, vi } from 'vitest';

import { SignedRequest } from '@/security/SignedRequest';

describe('SignedRequest', () => {
  it('creates headers and verifies successfully', async () => {
    const url = 'https://proxy.example/zin/d1/query?x=1';
    const body = JSON.stringify({ ok: true });

    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    expect(headers['x-zt-key-id']).toBe('k1');
    expect(headers['x-zt-timestamp']).toBe('1700000000000');
    expect(headers['x-zt-nonce']).toBe('n1');
    expect(headers['x-zt-body-sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(headers['x-zt-signature']).toMatch(/^[a-f0-9]{64}$/);

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers,
      getSecretForKeyId: async (keyId) => (keyId === 'k1' ? 'secret' : undefined),
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out.ok).toBe(true);
  });

  it('rejects invalid body sha', async () => {
    const url = 'https://proxy.example/zin/kv/get';
    const goodBody = JSON.stringify({ key: 'a' });
    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body: goodBody,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body: JSON.stringify({ key: 'b' }),
      headers,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out).toMatchObject({ ok: false, code: 'INVALID_BODY_SHA' });
  });

  it('rejects expired timestamps', async () => {
    const url = 'https://proxy.example/zin/kv/get';
    const body = JSON.stringify({ key: 'a' });
    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000 + 120_000,
      windowMs: 60_000,
    });

    expect(out).toMatchObject({ ok: false, code: 'EXPIRED' });
  });

  it('calls verifyNonce hook', async () => {
    const url = 'https://proxy.example/zin/d1/query';
    const body = JSON.stringify({ sql: 'select 1', params: [] });
    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    const verifyNonce = vi.fn(async () => true);
    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
      verifyNonce,
    });

    expect(out.ok).toBe(true);
    expect(verifyNonce).toHaveBeenCalledTimes(1);
    expect(verifyNonce.mock.calls[0]?.[0]).toBe('k1');
    expect(verifyNonce.mock.calls[0]?.[1]).toBe('n1');
  });

  it('verifies successfully when headers are a Headers instance', async () => {
    const url = 'https://proxy.example/zin/kv/get';
    const body = JSON.stringify({ key: 'a' });

    const headersObj = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });
    const headers = new Headers(headersObj as unknown as Record<string, string>);

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out.ok).toBe(true);
  });

  it('rejects when required headers are missing', async () => {
    const out = await SignedRequest.verify({
      method: 'POST',
      url: 'https://proxy.example/zin/kv/get',
      body: '',
      headers: { 'x-zt-key-id': 'k1' } as any,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out).toMatchObject({ ok: false, code: 'MISSING_HEADER' });
  });

  it('rejects invalid timestamp header', async () => {
    const out = await SignedRequest.verify({
      method: 'POST',
      url: 'https://proxy.example/zin/kv/get',
      body: '',
      headers: {
        'x-zt-key-id': 'k1',
        'x-zt-timestamp': 'nope',
        'x-zt-nonce': 'n1',
        'x-zt-body-sha256': '00',
        'x-zt-signature': '00',
      } as any,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out).toMatchObject({ ok: false, code: 'INVALID_TIMESTAMP' });
  });

  it('rejects unknown key id', async () => {
    const url = 'https://proxy.example/zin/kv/get';
    const body = JSON.stringify({ key: 'a' });
    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers,
      getSecretForKeyId: async () => undefined,
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out).toMatchObject({ ok: false, code: 'UNKNOWN_KEY' });
  });

  it('rejects invalid signature', async () => {
    const url = 'https://proxy.example/zin/kv/get';
    const body = JSON.stringify({ key: 'a' });
    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers: { ...headers, 'x-zt-signature': '0'.repeat(64) },
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
    });

    expect(out).toMatchObject({ ok: false, code: 'INVALID_SIGNATURE' });
  });

  it('rejects replayed nonces when verifyNonce returns false', async () => {
    const url = 'https://proxy.example/zin/kv/get';
    const body = JSON.stringify({ key: 'a' });
    const headers = await SignedRequest.createHeaders({
      method: 'POST',
      url,
      body,
      keyId: 'k1',
      secret: 'secret',
      timestampMs: 1_700_000_000_000,
      nonce: 'n1',
    });

    const out = await SignedRequest.verify({
      method: 'POST',
      url,
      body,
      headers,
      getSecretForKeyId: () => 'secret',
      nowMs: 1_700_000_000_000,
      windowMs: 60_000,
      verifyNonce: async () => false,
    });

    expect(out).toMatchObject({ ok: false, code: 'REPLAYED' });
  });

  it('throws a typed error when WebCrypto is not available', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
        enumerable: true,
        writable: true,
      });
      await expect(
        SignedRequest.createHeaders({
          method: 'POST',
          url: 'https://proxy.example/zin/kv/get',
          body: '',
          keyId: 'k1',
          secret: 'secret',
        })
      ).rejects.toThrow(/WebCrypto is not available/i);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (globalThis as any).crypto;
      }
    }
  });

  it('falls back when crypto.randomUUID is unavailable', async () => {
    const originalRandomUUID = globalThis.crypto.randomUUID;
    try {
      // Force the fallback nonce path.
      (globalThis.crypto as any).randomUUID = undefined;

      const { SignedRequest } = await import('@/security/SignedRequest');
      const out = await SignedRequest.createHeaders({
        method: 'POST',
        url: 'https://example.test/a',
        body: JSON.stringify({ ok: true }),
        keyId: 'k1',
        secret: 'secret',
      });

      expect(out['x-zt-nonce']).toBeTruthy();
      expect(out['x-zt-nonce']).not.toBe('');
    } finally {
      (globalThis.crypto as any).randomUUID = originalRandomUUID;
    }
  });
});
