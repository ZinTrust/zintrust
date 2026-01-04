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
});
