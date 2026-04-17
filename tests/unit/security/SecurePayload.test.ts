import { afterEach, describe, expect, it } from 'vitest';

import { EncryptedEnvelope } from '@security/EncryptedEnvelope';
import { SecurePayload } from '@security/SecurePayload';
import { Schema } from '@validation/Validator';

describe('SecurePayload', () => {
  const keyBytes = Buffer.from(
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    'hex'
  );
  const keyB64 = keyBytes.toString('base64');

  afterEach(() => {
    SecurePayload.clearDecryptors();
  });

  it('decodes an encrypted envelope with a registered decryptor, coercion, and validation', async () => {
    SecurePayload.registerDecryptor(
      'default-envelope',
      SecurePayload.createEnvelopeDecryptor({
        cipher: 'aes-256-cbc',
        key: keyB64,
      })
    );

    const raw = EncryptedEnvelope.encryptString(
      JSON.stringify({ amount: '42.5', currency: 'NGN', active: 'true' }),
      {
        cipher: 'aes-256-cbc',
        key: keyB64,
      }
    );

    const schema = Schema.create()
      .required('amount')
      .number('amount')
      .required('currency')
      .string('currency')
      .required('active')
      .boolean('active');

    const payload = await SecurePayload.decode(raw, { decryptor: 'default-envelope' })
      .decrypt()
      .json()
      .coerce({ amount: 'number', active: 'boolean' })
      .validate(schema)
      .typed<{ amount: number; currency: string; active: boolean }>();

    expect(payload).toEqual({ amount: 42.5, currency: 'NGN', active: true });
  });

  it('supports an inline decryptor with request-scoped context', async () => {
    const payload = await SecurePayload.decode('ciphertext', {
      context: { suffix: '-scoped' },
      decryptor: async (raw, context) => JSON.stringify({ raw, suffix: context.suffix }),
    })
      .decrypt()
      .json()
      .typed<{ raw: string; suffix: string }>();

    expect(payload).toEqual({ raw: 'ciphertext', suffix: '-scoped' });
  });

  it('fails with a normalized json-stage error when payload parsing fails', async () => {
    await expect(
      SecurePayload.decode('not-json', {
        decryptor: async (raw) => raw,
      })
        .decrypt()
        .json()
        .typed()
    ).rejects.toThrow(/SecurePayload json failed/i);
  });

  it('fails with a normalized coerce-stage error when coercion cannot complete', async () => {
    await expect(
      SecurePayload.decode('{"amount":"abc"}', {
        decryptor: async (raw) => raw,
      })
        .decrypt()
        .json()
        .coerce({ amount: 'number' })
        .typed()
    ).rejects.toThrow(/SecurePayload coerce failed/i);
  });

  it('fails with a normalized validate-stage error when schema validation fails', async () => {
    const schema = Schema.create().required('amount').number('amount').positiveNumber('amount');

    await expect(
      SecurePayload.decode('{"amount":0}', {
        decryptor: async (raw) => raw,
      })
        .decrypt()
        .json()
        .validate(schema)
        .typed()
    ).rejects.toThrow(/SecurePayload validate failed/i);
  });

  it('tracks registered decryptors without retaining per-request state', () => {
    SecurePayload.registerDecryptor('one', async (raw) => raw);
    SecurePayload.registerDecryptor('two', async (raw) => raw);

    expect(SecurePayload.hasDecryptor('one')).toBe(true);
    expect(SecurePayload.listDecryptors()).toEqual(['one', 'two']);

    expect(SecurePayload.unregisterDecryptor('one')).toBe(true);
    expect(SecurePayload.listDecryptors()).toEqual(['two']);
  });

  it('covers decryptor validation and common coercion branches', async () => {
    expect(() => SecurePayload.registerDecryptor('', async (raw) => raw)).toThrow(
      /decryptor name must be provided/i
    );

    await expect(SecurePayload.decode('payload').decrypt().typed()).rejects.toThrow(
      /No decryptor was provided/i
    );

    await expect(
      SecurePayload.decode('payload', { decryptor: 'missing' }).decrypt().typed()
    ).rejects.toThrow(/Unknown decryptor/i);

    await expect(
      SecurePayload.decode('123', { decryptor: async () => 123 as never })
        .decrypt()
        .json()
        .typed()
    ).rejects.toThrow(/JSON parsing requires a string payload/i);

    await expect(
      SecurePayload.decode('{"flag":"maybe"}', { decryptor: async (raw) => raw })
        .decrypt()
        .json()
        .coerce({ flag: 'boolean' })
        .typed()
    ).rejects.toThrow(/Boolean coercion failed/i);

    await expect(
      SecurePayload.decode('{"count":"1.5"}', { decryptor: async (raw) => raw })
        .decrypt()
        .json()
        .coerce({ count: 'integer' })
        .typed()
    ).rejects.toThrow(/Integer coercion failed/i);
  });

  it('handles string coercion, null passthrough, and envelope decryptor wrapping', async () => {
    const envelopeDecryptor = SecurePayload.createEnvelopeDecryptor({
      cipher: 'aes-256-cbc',
      key: keyB64,
      previousKeys: [keyB64],
    });

    const ciphertext = EncryptedEnvelope.encryptString('{"wrapped":true}', {
      cipher: 'aes-256-cbc',
      key: keyB64,
    });
    const wrapped = await envelopeDecryptor(ciphertext);
    expect(wrapped).toBe('{"wrapped":true}');

    const payload = await SecurePayload.decode('{"name":123,"note":null}', {
      decryptor: async (raw) => raw,
    })
      .decrypt()
      .json()
      .coerce({ name: 'string', note: 'string' })
      .typed<{ name: string; note: null }>();

    expect(payload).toEqual({ name: '123', note: null });
  });
});
