/**
 * EncryptedEnvelope
 *
 * Framework-compatible encrypted payload envelope (PHP-style envelope).
 *
 * Format: base64(JSON({ iv, value, mac, tag }))
 * - iv: base64
 * - value: base64 ciphertext
 * - mac: hex string (AES-CBC envelopes)
 * - tag: base64 auth tag (AES-GCM envelopes)
 */

import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from '@node-singletons/crypto';

export type EncryptedEnvelopeCipher = 'aes-256-cbc' | 'aes-256-gcm';
export type EncryptedEnvelopeCipherInput = EncryptedEnvelopeCipher | 'AES-256-CBC' | 'AES-256-GCM';

export type EncryptedEnvelopePayload = {
  iv: string;
  value: string;
  mac?: string;
  tag?: string;
};

export type EncryptedEnvelopeSerializer<T> = {
  serialize: (value: T) => string;
  deserialize: (value: string) => T;
};

export type EncryptedEnvelopeKeyring = {
  primaryKey: Uint8Array;
  previousKeys: Uint8Array[];
};

export type EncryptedEnvelopeEnv = {
  APP_KEY?: string;
  APP_PREVIOUS_KEYS?: string;
  ENCRYPTION_CIPHER?: string;
};

const normalizeCipher = (cipher: EncryptedEnvelopeCipherInput): EncryptedEnvelopeCipher => {
  const normalized = cipher.toLowerCase();

  if (normalized === 'aes-256-cbc') return 'aes-256-cbc';
  if (normalized === 'aes-256-gcm') return 'aes-256-gcm';

  throw ErrorFactory.createValidationError('Unsupported ENCRYPTION_CIPHER', {
    cipher,
    supported: ['aes-256-cbc', 'aes-256-gcm'],
  });
};

const normalizeBase64ForCompare = (value: string): string => {
  const trimmed = value.trim();

  // Remove base64 padding without regex (avoids any regex backtracking concerns).
  let end = trimmed.length;
  while (end > 0 && trimmed.codePointAt(end - 1) === 61) {
    end -= 1;
  }

  return trimmed.slice(0, end);
};

const decodeBase64 = (input: string, label: string): Buffer => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createValidationError(`Invalid base64 for ${label}`);
  }

  // Note: Buffer.from(..., 'base64') does not reliably throw on invalid input.
  // Validate by re-encoding and comparing (ignoring padding).
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === 0) {
    throw ErrorFactory.createValidationError(`Invalid base64 for ${label}`);
  }

  const roundTrip = decoded.toString('base64');
  if (normalizeBase64ForCompare(roundTrip) !== normalizeBase64ForCompare(trimmed)) {
    throw ErrorFactory.createValidationError(`Invalid base64 for ${label}`);
  }

  return decoded;
};

const CIPHER_KEY_BYTES: Record<EncryptedEnvelopeCipher, number> = Object.freeze({
  'aes-256-cbc': 32,
  'aes-256-gcm': 32,
});

const expectedKeyBytesForCipher = (cipher: EncryptedEnvelopeCipher): number =>
  CIPHER_KEY_BYTES[cipher];

const parseKey = (key: string, cipher: EncryptedEnvelopeCipher): Uint8Array => {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createValidationError('Missing APP_KEY');
  }

  const raw = trimmed.startsWith('base64:') ? trimmed.slice('base64:'.length) : trimmed;
  const bytes = decodeBase64(raw, 'APP_KEY');

  const expectedBytes = expectedKeyBytesForCipher(cipher);
  if (bytes.length !== expectedBytes) {
    throw ErrorFactory.createValidationError('Invalid APP_KEY length for cipher', {
      cipher,
      expectedBytes,
      actualBytes: bytes.length,
    });
  }

  return new Uint8Array(bytes);
};

const parsePreviousKeys = (
  raw: string | undefined,
  cipher: EncryptedEnvelopeCipher
): Uint8Array[] => {
  const value = (raw ?? '').trim();
  if (value.length === 0) return [];

  const items: string[] = (() => {
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v) => typeof v === 'string');
      } catch {
        return [];
      }
    }

    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  })();

  return items.map((k) => parseKey(k, cipher));
};

const parsePayload = (payload: string): EncryptedEnvelopePayload => {
  const decoded = Buffer.from(payload, 'base64').toString('utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw ErrorFactory.createValidationError('Invalid encrypted envelope payload (not JSON)');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw ErrorFactory.createValidationError('Invalid encrypted envelope payload (not an object)');
  }

  const record = parsed as Record<string, unknown>;
  const iv = typeof record['iv'] === 'string' ? record['iv'] : '';
  const value = typeof record['value'] === 'string' ? record['value'] : '';
  const mac = typeof record['mac'] === 'string' ? record['mac'] : undefined;
  const tag = typeof record['tag'] === 'string' ? record['tag'] : undefined;

  if (iv.length === 0 || value.length === 0) {
    throw ErrorFactory.createValidationError(
      'Invalid encrypted envelope payload (missing iv/value)'
    );
  }

  return { iv, value, mac, tag };
};

const computeMacHex = (key: Uint8Array, ivBase64: string, valueBase64: string): string => {
  // Envelope MAC: mac = HMAC-SHA256(iv + value, key), where iv/value are base64 strings.
  return createHmac('sha256', Buffer.from(key))
    .update(ivBase64 + valueBase64, 'utf8')
    .digest('hex');
};

const timingSafeEqualsHex = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
};

const ivLengthFor = (cipher: EncryptedEnvelopeCipher): number => {
  // OpenSSL defaults for these ciphers.
  if (cipher === 'aes-256-gcm') return 12;
  return 16;
};

const decryptWithKey = (
  payload: EncryptedEnvelopePayload,
  cipher: EncryptedEnvelopeCipher,
  key: Uint8Array
): string => {
  const iv = decodeBase64(payload.iv, 'iv');
  const ciphertext = decodeBase64(payload.value, 'value');

  if (cipher === 'aes-256-cbc') {
    const expected = payload.mac ?? '';
    if (expected.length === 0) {
      throw ErrorFactory.createValidationError('Missing mac for aes-256-cbc envelope');
    }

    const actual = computeMacHex(key, payload.iv, payload.value);
    if (!timingSafeEqualsHex(actual, expected)) {
      throw ErrorFactory.createSecurityError('Invalid MAC');
    }

    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  }

  const tagB64 = (payload.tag ?? '').trim();
  if (tagB64.length === 0) {
    throw ErrorFactory.createValidationError('Missing tag for aes-256-gcm envelope');
  }

  const tag = decodeBase64(tagB64, 'tag');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
};

export const EncryptedEnvelope = Object.freeze({
  normalizeCipher,

  /**
   * Build a keyring from environment variables.
   * - Uses APP_KEY
   * - Supports APP_PREVIOUS_KEYS (comma-separated or JSON array)
   */
  keyringFromEnv(
    env: EncryptedEnvelopeEnv = Env as unknown as EncryptedEnvelopeEnv
  ): EncryptedEnvelopeKeyring {
    const cipherRaw = (env.ENCRYPTION_CIPHER ?? '').trim();
    if (cipherRaw.length === 0) {
      throw ErrorFactory.createConfigError('ENCRYPTION_CIPHER must be set', {
        key: 'ENCRYPTION_CIPHER',
      });
    }

    const cipher = normalizeCipher(cipherRaw as EncryptedEnvelopeCipherInput);
    const primaryKey = parseKey(env.APP_KEY ?? '', cipher);
    const previousKeys = parsePreviousKeys(env.APP_PREVIOUS_KEYS, cipher);

    return { primaryKey, previousKeys };
  },

  /**
   * Encrypt a UTF-8 string and return a framework-compatible base64(JSON) envelope.
   */
  encryptString(
    plaintext: string,
    options: { cipher: EncryptedEnvelopeCipherInput; key: string }
  ): string {
    const cipher = normalizeCipher(options.cipher);
    const key = parseKey(options.key, cipher);

    const iv = randomBytes(ivLengthFor(cipher));

    if (cipher === 'aes-256-cbc') {
      const c = createCipheriv('aes-256-cbc', Buffer.from(key), iv);
      const ciphertext = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final()]);

      const ivB64 = iv.toString('base64');
      const valueB64 = ciphertext.toString('base64');
      const mac = computeMacHex(key, ivB64, valueB64);

      const envelope: EncryptedEnvelopePayload = { iv: ivB64, value: valueB64, mac, tag: '' };
      return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
    }

    const c = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
    const ciphertext = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final()]);
    const tag = c.getAuthTag();

    const envelope: EncryptedEnvelopePayload = {
      iv: iv.toString('base64'),
      value: ciphertext.toString('base64'),
      mac: '',
      tag: tag.toString('base64'),
    };

    return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  },

  /**
   * Decrypt a framework-compatible base64(JSON) envelope to a UTF-8 string.
   * Tries the primary key first, then previous keys.
   */
  decryptString(
    encrypted: string,
    options: { cipher: EncryptedEnvelopeCipherInput; key: string; previousKeys?: string[] }
  ): string {
    const cipher = normalizeCipher(options.cipher);
    const primaryKey = parseKey(options.key, cipher);
    const previous = (options.previousKeys ?? []).map((k) => parseKey(k, cipher));

    const payload = parsePayload(encrypted);

    const keys = [primaryKey, ...previous];
    let lastError: unknown;

    for (const key of keys) {
      try {
        return decryptWithKey(payload, cipher, key);
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw ErrorFactory.createSecurityError(
      'Unable to decrypt encrypted envelope with provided keyring',
      {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
      }
    );
  },

  /**
   * Encrypt arbitrary values using a caller-provided serializer.
   * This supports encrypted payloads for frameworks that store serialized values.
   */
  encrypt<T>(
    value: T,
    options: {
      cipher: EncryptedEnvelopeCipherInput;
      key: string;
      serializer: EncryptedEnvelopeSerializer<T>;
    }
  ): string {
    const serialized = options.serializer.serialize(value);
    return EncryptedEnvelope.encryptString(serialized, {
      cipher: options.cipher,
      key: options.key,
    });
  },

  /**
   * Decrypt into an arbitrary value using a caller-provided serializer.
   */
  decrypt<T>(
    encrypted: string,
    options: {
      cipher: EncryptedEnvelopeCipherInput;
      key: string;
      previousKeys?: string[];
      serializer: EncryptedEnvelopeSerializer<T>;
    }
  ): T {
    const serialized = EncryptedEnvelope.decryptString(encrypted, {
      cipher: options.cipher,
      key: options.key,
      previousKeys: options.previousKeys,
    });

    return options.serializer.deserialize(serialized);
  },
});

export default EncryptedEnvelope;
