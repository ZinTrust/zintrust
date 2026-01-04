export type SignedRequestHeaders = {
  'x-zt-key-id': string;
  'x-zt-timestamp': string;
  'x-zt-nonce': string;
  'x-zt-body-sha256': string;
  'x-zt-signature': string;
};

export type SignedRequestVerifyParams = {
  method: string;
  url: string | URL;
  body?: string | Uint8Array | null;
  headers: Headers | Record<string, string | undefined>;
  getSecretForKeyId: (keyId: string) => string | undefined | Promise<string | undefined>;
  nowMs?: number;
  windowMs?: number;
  verifyNonce?: (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;
};

export type SignedRequestVerifyResult =
  | {
      ok: true;
      keyId: string;
      timestampMs: number;
      nonce: string;
    }
  | {
      ok: false;
      code:
        | 'MISSING_HEADER'
        | 'INVALID_TIMESTAMP'
        | 'EXPIRED'
        | 'INVALID_BODY_SHA'
        | 'INVALID_SIGNATURE'
        | 'UNKNOWN_KEY'
        | 'REPLAYED';
      message: string;
    };

type SignedRequestVerifyFailure = Extract<SignedRequestVerifyResult, { ok: false }>;

type BufferSourceLike = ArrayBuffer | ArrayBufferView;

type SubtleCryptoLike = {
  digest: (algorithm: string, data: BufferSourceLike) => Promise<ArrayBuffer>;
  importKey: (
    format: 'raw',
    keyData: BufferSourceLike,
    algorithm: { name: 'HMAC'; hash: 'SHA-256' | { name: 'SHA-256' } },
    extractable: boolean,
    keyUsages: readonly ['sign']
  ) => Promise<unknown>;
  sign: (algorithm: 'HMAC', key: unknown, data: BufferSourceLike) => Promise<ArrayBuffer>;
};

const getHeader = (
  headers: Headers | Record<string, string | undefined>,
  name: keyof SignedRequestHeaders
): string | undefined => {
  if (typeof (headers as Headers).get === 'function') {
    const value = (headers as Headers).get(name);
    return value ?? undefined;
  }
  return (headers as Record<string, string | undefined>)[name];
};

const timingSafeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return result === 0;
};

const getSubtleOrNull = (): SubtleCryptoLike | null => {
  if (typeof crypto === 'undefined' || crypto.subtle === undefined) return null;
  return crypto.subtle as unknown as SubtleCryptoLike;
};

const toBytes = (data: string | Uint8Array): Uint8Array => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return new Uint8Array(bytes);
};

const toHex = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const element of view) {
    out += element.toString(16).padStart(2, '0');
  }
  return out;
};

const sha256Hex = async (data: string | Uint8Array): Promise<string> => {
  const subtle = getSubtleOrNull();
  if (subtle === null) return '';
  const digest = await subtle.digest('SHA-256', toBytes(data));
  return toHex(digest);
};

const canonicalString = (params: {
  method: string;
  url: string | URL;
  timestampMs: number;
  nonce: string;
  bodySha256Hex: string;
}): string => {
  const u = typeof params.url === 'string' ? new URL(params.url) : params.url;
  const method = params.method.toUpperCase();
  return [
    method,
    u.pathname,
    u.search,
    String(params.timestampMs),
    params.nonce,
    params.bodySha256Hex,
  ].join('\n');
};

const parseAndValidateHeaders = (
  headers: Headers | Record<string, string | undefined>
):
  | {
      ok: true;
      keyId: string;
      timestampMs: number;
      nonce: string;
      bodySha: string;
      signature: string;
    }
  | SignedRequestVerifyFailure => {
  const keyId = getHeader(headers, 'x-zt-key-id');
  const ts = getHeader(headers, 'x-zt-timestamp');
  const nonce = getHeader(headers, 'x-zt-nonce');
  const bodySha = getHeader(headers, 'x-zt-body-sha256');
  const signature = getHeader(headers, 'x-zt-signature');

  if (
    keyId === undefined ||
    ts === undefined ||
    nonce === undefined ||
    bodySha === undefined ||
    signature === undefined
  ) {
    return { ok: false, code: 'MISSING_HEADER', message: 'Missing required signing headers' };
  }

  const timestampMs = Number.parseInt(ts, 10);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, code: 'INVALID_TIMESTAMP', message: 'Invalid x-zt-timestamp' };
  }

  return { ok: true, keyId, timestampMs, nonce, bodySha, signature };
};

const validateTimestampWindow = (params: {
  nowMs: number;
  timestampMs: number;
  windowMs: number;
}): SignedRequestVerifyFailure | { ok: true } => {
  if (Math.abs(params.nowMs - params.timestampMs) > params.windowMs) {
    return { ok: false, code: 'EXPIRED', message: 'Request timestamp outside allowed window' };
  }
  return { ok: true };
};

const validateBodyHash = async (params: {
  body: string | Uint8Array;
  bodyShaHeader: string;
}): Promise<SignedRequestVerifyFailure | { ok: true }> => {
  const computedBodySha = await sha256Hex(params.body);
  if (computedBodySha === '' || !timingSafeEquals(computedBodySha, params.bodyShaHeader)) {
    return { ok: false, code: 'INVALID_BODY_SHA', message: 'Body hash mismatch' };
  }
  return { ok: true };
};

const validateSignature = async (params: {
  method: string;
  url: string | URL;
  timestampMs: number;
  nonce: string;
  bodySha: string;
  signature: string;
  secret: string;
}): Promise<SignedRequestVerifyFailure | { ok: true }> => {
  const subtle = getSubtleOrNull();
  if (subtle === null) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'WebCrypto is not available' };
  }

  const canonical = canonicalString({
    method: params.method,
    url: params.url,
    timestampMs: params.timestampMs,
    nonce: params.nonce,
    bodySha256Hex: params.bodySha,
  });

  const key = await subtle.importKey(
    'raw',
    toBytes(params.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expectedBytes = await subtle.sign('HMAC', key, toBytes(canonical));
  const expected = toHex(expectedBytes);

  if (!timingSafeEquals(expected, params.signature)) {
    return { ok: false, code: 'INVALID_SIGNATURE', message: 'Invalid signature' };
  }

  return { ok: true };
};

export const SignedRequest = Object.freeze({
  sha256Hex,
  canonicalString,

  async verify(params: SignedRequestVerifyParams): Promise<SignedRequestVerifyResult> {
    const parsed = parseAndValidateHeaders(params.headers);
    if (parsed.ok === false) return parsed;

    const { keyId, timestampMs, nonce, bodySha, signature } = parsed;
    const nowMs = params.nowMs ?? Date.now();
    const windowMs = params.windowMs ?? 60_000;

    const windowCheck = validateTimestampWindow({ nowMs, timestampMs, windowMs });
    if (windowCheck.ok === false) return windowCheck;

    const bodyCheck = await validateBodyHash({ body: params.body ?? '', bodyShaHeader: bodySha });
    if (bodyCheck.ok === false) return bodyCheck;

    const secret = await params.getSecretForKeyId(keyId);
    if (secret === undefined || secret.trim() === '') {
      return { ok: false, code: 'UNKNOWN_KEY', message: 'Unknown key id' };
    }

    const sigCheck = await validateSignature({
      method: params.method,
      url: params.url,
      timestampMs,
      nonce,
      bodySha,
      signature,
      secret,
    });
    if (sigCheck.ok === false) return sigCheck;

    if (params.verifyNonce !== undefined) {
      const ok = await params.verifyNonce(keyId, nonce, windowMs);
      if (ok === false) {
        return { ok: false, code: 'REPLAYED', message: 'Nonce replayed or rejected' };
      }
    }

    return { ok: true, keyId, timestampMs, nonce };
  },
});
