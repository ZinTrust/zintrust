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

  it('throws when cipher is unsupported', () => {
    expect(() => EncryptedEnvelope.normalizeCipher('aes-128-cbc' as any)).toThrow(
      /unsupported.*cipher/i
    );
  });

  it('throws when APP_KEY is missing', () => {
    expect(() =>
      EncryptedEnvelope.encryptString('test', { cipher: 'aes-256-cbc', key: '' })
    ).toThrow(/missing.*app_key/i);
  });

  it('throws when APP_KEY has invalid length', () => {
    const shortKey = Buffer.from('short', 'utf8').toString('base64');
    expect(() =>
      EncryptedEnvelope.encryptString('test', { cipher: 'aes-256-cbc', key: shortKey })
    ).toThrow(/invalid.*app_key.*length/i);
  });

  it('throws when base64 is invalid', () => {
    expect(() =>
      EncryptedEnvelope.encryptString('test', { cipher: 'aes-256-cbc', key: '!!!invalid' })
    ).toThrow(/invalid.*base64/i);
  });

  it('throws when encrypted payload is not valid JSON', () => {
    const badPayload = Buffer.from('not-json', 'utf8').toString('base64');
    expect(() =>
      EncryptedEnvelope.decryptString(badPayload, { cipher: 'aes-256-cbc', key: keyB64 })
    ).toThrow(/invalid.*payload.*json/i);
  });

  it('throws when encrypted payload JSON is not an object', () => {
    const notObjectPayload = Buffer.from(JSON.stringify(null), 'utf8').toString('base64');
    expect(() =>
      EncryptedEnvelope.decryptString(notObjectPayload, { cipher: 'aes-256-cbc', key: keyB64 })
    ).toThrow(/not an object/i);
  });

  it('throws when encrypted payload is missing iv/value', () => {
    const badPayload = Buffer.from(JSON.stringify({ iv: '' }), 'utf8').toString('base64');
    expect(() =>
      EncryptedEnvelope.decryptString(badPayload, { cipher: 'aes-256-cbc', key: keyB64 })
    ).toThrow(/missing.*iv.*value/i);
  });

  it('throws when aes-256-cbc envelope is missing mac', () => {
    const noMacPayload = Buffer.from(
      JSON.stringify({ iv: 'dGVzdA==', value: 'dGVzdA==' }),
      'utf8'
    ).toString('base64');
    expect(() =>
      EncryptedEnvelope.decryptString(noMacPayload, { cipher: 'aes-256-cbc', key: keyB64 })
    ).toThrow(/missing.*mac|unable.*decrypt/i);
  });

  it('throws when aes-256-gcm envelope is missing tag', () => {
    const noTagPayload = Buffer.from(
      JSON.stringify({ iv: 'dGVzdA==', value: 'dGVzdA==', mac: '' }),
      'utf8'
    ).toString('base64');
    expect(() =>
      EncryptedEnvelope.decryptString(noTagPayload, { cipher: 'aes-256-gcm', key: keyB64 })
    ).toThrow(/missing.*tag|unable.*decrypt/i);
  });

  it('throws when iv base64 trims to empty', () => {
    const payload = Buffer.from(
      JSON.stringify({ iv: '   ', value: 'dGVzdA==', mac: '00' }),
      'utf8'
    ).toString('base64');

    expect(() =>
      EncryptedEnvelope.decryptString(payload, { cipher: 'aes-256-cbc', key: keyB64 })
    ).toThrow(/invalid base64.*iv|unable.*decrypt/i);
  });

  it('throws when iv base64 decodes to an empty buffer', () => {
    const payload = Buffer.from(
      JSON.stringify({ iv: '====', value: 'dGVzdA==', mac: '00' }),
      'utf8'
    ).toString('base64');

    expect(() =>
      EncryptedEnvelope.decryptString(payload, { cipher: 'aes-256-cbc', key: keyB64 })
    ).toThrow(/invalid base64.*iv|unable.*decrypt/i);
  });

  it('throws when keyringFromEnv is called without ENCRYPTION_CIPHER', () => {
    const env = { ENCRYPTION_CIPHER: '', APP_KEY: keyB64 };
    expect(() => EncryptedEnvelope.keyringFromEnv(env)).toThrow(/encryption_cipher.*must be set/i);
  });

  it('parses APP_PREVIOUS_KEYS as JSON array', () => {
    const env = {
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: keyB64,
      APP_PREVIOUS_KEYS: JSON.stringify([keyB64]),
    };

    const keyring = EncryptedEnvelope.keyringFromEnv(env);
    expect(keyring.previousKeys.length).toBe(1);
  });

  it('treats invalid JSON APP_PREVIOUS_KEYS as empty', () => {
    const env = {
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: keyB64,
      APP_PREVIOUS_KEYS: '[not-valid-json',
    };

    const keyring = EncryptedEnvelope.keyringFromEnv(env);
    expect(keyring.previousKeys.length).toBe(0);
  });

  it('handles empty APP_PREVIOUS_KEYS gracefully', () => {
    const env = {
      ENCRYPTION_CIPHER: 'aes-256-cbc',
      APP_KEY: keyB64,
      APP_PREVIOUS_KEYS: '',
    };

    const keyring = EncryptedEnvelope.keyringFromEnv(env);
    expect(keyring.previousKeys.length).toBe(0);
  });
});
