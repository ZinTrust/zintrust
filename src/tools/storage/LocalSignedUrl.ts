import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHmac } from '@node-singletons/crypto';

export type LocalSignedUrlPayload = {
  disk: 'local';
  key: string;
  exp: number; // epoch millis
  method: 'GET';
};

const base64UrlEncode = (value: string | Buffer): string => {
  const base64 = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value).toString('base64');
  // replace characters used in regular base64 and remove any trailing '=' padding
  let result = base64.replaceAll('+', '-').replaceAll('/', '_');
  // Remove trailing '=' characters without using a regex to avoid potential super-linear backtracking.
  while (result.endsWith('=')) {
    result = result.slice(0, -1);
  }
  return result;
};

const base64UrlDecodeToString = (value: string): string => {
  const padded = value + '==='.slice((value.length + 3) % 4);
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');
  return Buffer.from(base64, 'base64').toString('utf8');
};

const timingSafeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return result === 0;
};

const assertValidKey = (key: string): void => {
  if (key.trim() === '') {
    throw ErrorFactory.createValidationError('Local signed url: key is required');
  }

  // Hard fail on obvious traversal / absolute paths.
  // Keep this strict; keys should be relative like `uploads/a.png`.
  if (key.startsWith('/') || key.startsWith('\\')) {
    throw ErrorFactory.createValidationError('Local signed url: key must be relative');
  }

  const segments = key.split(/[/\\]+/g);
  if (segments.some((s) => s === '..' || s === '.')) {
    throw ErrorFactory.createValidationError('Local signed url: invalid key');
  }

  if (key.includes('\0')) {
    throw ErrorFactory.createValidationError('Local signed url: invalid key');
  }
};

const sign = (payloadEncoded: string, secret: string): string => {
  if (secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'Local signed url: signing secret not configured (set APP_KEY)'
    );
  }

  const signature = createHmac('sha256', secret).update(payloadEncoded).digest();
  return base64UrlEncode(signature);
};

export const LocalSignedUrl = Object.freeze({
  createToken(payload: LocalSignedUrlPayload, secret: string): string {
    assertValidKey(payload.key);

    if (payload.disk !== 'local') {
      throw ErrorFactory.createValidationError('Local signed url: unsupported disk', {
        disk: payload.disk,
      });
    }

    if (payload.method !== 'GET') {
      throw ErrorFactory.createValidationError('Local signed url: unsupported method', {
        method: payload.method,
      });
    }

    if (!Number.isFinite(payload.exp) || payload.exp <= 0) {
      throw ErrorFactory.createValidationError('Local signed url: invalid expiration');
    }

    const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
    const signatureEncoded = sign(payloadEncoded, secret);

    return `${payloadEncoded}.${signatureEncoded}`;
  },

  verifyToken(token: string, secret: string, nowMs: number = Date.now()): LocalSignedUrlPayload {
    if (token.trim() === '') {
      throw ErrorFactory.createValidationError('Local signed url: token is required');
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      throw ErrorFactory.createValidationError('Local signed url: malformed token');
    }

    const payloadEncoded = parts[0] ?? '';
    const signatureEncoded = parts[1] ?? '';

    const expectedSignature = sign(payloadEncoded, secret);
    if (!timingSafeEquals(signatureEncoded, expectedSignature)) {
      throw ErrorFactory.createSecurityError('Local signed url: invalid signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(base64UrlDecodeToString(payloadEncoded));
    } catch (err) {
      throw ErrorFactory.createValidationError('Local signed url: invalid payload', { error: err });
    }

    const p = payload as Partial<LocalSignedUrlPayload>;
    if (
      p.disk !== 'local' ||
      typeof p.key !== 'string' ||
      typeof p.exp !== 'number' ||
      p.method !== 'GET'
    ) {
      throw ErrorFactory.createValidationError('Local signed url: invalid payload');
    }

    assertValidKey(p.key);

    if (p.exp < nowMs) {
      throw ErrorFactory.createSecurityError('Local signed url: token expired');
    }

    return p as LocalSignedUrlPayload;
  },
});

export default LocalSignedUrl;
