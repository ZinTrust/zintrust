import { describe, expect, it } from 'vitest';

import { EncryptedEnvelope } from '@security/EncryptedEnvelope';

describe('EncryptedEnvelope', () => {
  const keyBytes = Buffer.from(
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    'hex'
  );
  const keyB64 = keyBytes.toString('base64');
  const keyBase64Prefixed = `base64:${keyB64}`;

  it('normalizes cipher case-insensitively', () => {
    expect(EncryptedEnvelope.normalizeCipher('AES-256-CBC')).toBe('aes-256-cbc');
    expect(EncryptedEnvelope.normalizeCipher('aes-256-gcm')).toBe('aes-256-gcm');
  });

  it('roundtrips aes-256-cbc string envelopes', () => {
    const encrypted = EncryptedEnvelope.encryptString('hello', {
      cipher: 'aes-256-cbc',
      key: keyBase64Prefixed,
    });

    const plain = EncryptedEnvelope.decryptString(encrypted, {
      cipher: 'AES-256-CBC',
      key: keyB64,
    });

    expect(plain).toBe('hello');
  });

  it('fails aes-256-cbc when mac is tampered', () => {
    const encrypted = EncryptedEnvelope.encryptString('hello', {
      cipher: 'aes-256-cbc',
      key: keyB64,
    });

    const decoded = Buffer.from(encrypted, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as any;
    parsed.mac = '0'.repeat(String(parsed.mac ?? '').length || 64);
    const tampered = Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64');

    expect(() =>
      EncryptedEnvelope.decryptString(tampered, {
        cipher: 'aes-256-cbc',
        key: keyB64,
      })
    ).toThrow(/mac|decrypt/i);
  });

  it('roundtrips aes-256-gcm string envelopes', () => {
    const encrypted = EncryptedEnvelope.encryptString('hello', {
      cipher: 'aes-256-gcm',
      key: keyB64,
    });

    const plain = EncryptedEnvelope.decryptString(encrypted, {
      cipher: 'AES-256-GCM',
      key: keyB64,
    });

    expect(plain).toBe('hello');
  });

  it('supports key rotation (decrypt with previous key)', () => {
    const oldKey = Buffer.from('a'.repeat(64), 'hex').toString('base64');
    const newKey = Buffer.from('b'.repeat(64), 'hex').toString('base64');

    const encrypted = EncryptedEnvelope.encryptString('rotated', {
      cipher: 'aes-256-cbc',
      key: oldKey,
    });

    const plain = EncryptedEnvelope.decryptString(encrypted, {
      cipher: 'aes-256-cbc',
      key: newKey,
      previousKeys: [oldKey],
    });

    expect(plain).toBe('rotated');
  });

  it('builds keyringFromEnv with APP_PREVIOUS_KEYS (comma-separated)', () => {
    const env = {
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: keyBase64Prefixed,
      APP_PREVIOUS_KEYS: `${keyB64},${keyBase64Prefixed}`,
    };

    const keyring = EncryptedEnvelope.keyringFromEnv(env);
    expect(keyring.primaryKey.byteLength).toBe(32);
    expect(keyring.previousKeys.length).toBe(2);
  });

  it('supports serializer hooks for encrypt/decrypt', () => {
    const serializer = {
      serialize: (value: { a: number }) => JSON.stringify(value),
      deserialize: (value: string) => JSON.parse(value) as { a: number },
    };

    const encrypted = EncryptedEnvelope.encrypt(
      { a: 1 },
      {
        cipher: 'aes-256-cbc',
        key: keyB64,
        serializer,
      }
    );

    const decrypted = EncryptedEnvelope.decrypt(encrypted, {
      cipher: 'aes-256-cbc',
      key: keyB64,
      serializer,
    });

    expect(decrypted).toEqual({ a: 1 });
  });
});
