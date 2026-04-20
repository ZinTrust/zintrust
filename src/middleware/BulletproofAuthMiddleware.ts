import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import { isMaxLength, isMinLength, isNonEmptyString } from '@helper/index';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import {
  respondWithMiddlewareFailure,
  type MiddlewareFailureResponder,
} from '@middleware/MiddlewareFailureResponder';
import type { Middleware } from '@middleware/MiddlewareStack';
import { BulletproofDeviceStore } from '@security/BulletproofDeviceStore';
import type { JwtAlgorithm, JwtPayload } from '@security/JwtManager';
import { JwtManager } from '@security/JwtManager';
import { JwtSessions } from '@security/JwtSessions';
import { NonceReplay, type NonceReplayVerifier } from '@security/NonceReplay';
import { SignedRequest } from '@security/SignedRequest';

export type BulletproofAuthContext = {
  strategy: 'bulletproof';
  deviceId: string;
  keyId: string;
  signedRequest: {
    timestampMs: number;
    nonce: string;
  };
};

type SecretForKeyResolver = (
  keyId: string,
  req: IRequest
) => string | undefined | Promise<string | undefined>;

export interface BulletproofAuthOptions {
  algorithm?: JwtAlgorithm;
  secret?: string;
  onUnauthorized?: MiddlewareFailureResponder;

  /**
   * Signed-request validity window.
   * Default: 60 seconds.
   */
  windowMs?: number;

  /**
   * Header containing the device identifier.
   * Default: x-zt-device-id
   */
  deviceIdHeader?: string;

  /**
   * Require device id header to be present.
   * Default: true
   */
  requireDeviceId?: boolean;

  /**
   * Require device id to match a claim in the JWT payload.
   * Default: true
   */
  requireDeviceClaimMatch?: boolean;

  /**
   * Claim keys to check for device binding.
   * Default: ['deviceId','device_id','did']
   */
  deviceClaimKeys?: readonly string[];

  /**
   * Optional timezone header.
   * Default: x-zt-timezone
   */
  timezoneHeader?: string;

  /**
   * Require timezone header to be present.
   * Default: false
   */
  requireTimezone?: boolean;

  /**
   * If the token contains a timezone claim, require it to match the header.
   * Default: true
   */
  requireTimezoneClaimMatch?: boolean;

  /**
   * Claim keys to check for timezone binding.
   * Default: ['tz','timezone','timeZone']
   */
  timezoneClaimKeys?: readonly string[];

  /**
   * If the token contains a user-agent hash claim, require it to match.
   * Default: true
   */
  requireUserAgentHashMatch?: boolean;

  /**
   * Claim keys to check for user-agent hash binding.
   * Default: ['uaHash','uah','userAgentHash']
   */
  userAgentHashClaimKeys?: readonly string[];

  /**
   * Provide a secret for SignedRequest verification.
   * If omitted, uses `signingSecret` (single static secret) when present.
   */
  getSecretForKeyId?: SecretForKeyResolver;

  /**
   * Single static secret for SignedRequest verification (easy mode).
   * Can also be provided via env `BULLETPROOF_SIGNING_SECRET`.
   */
  signingSecret?: string;

  /**
   * Optional custom nonce verification hook.
   * If omitted, uses an in-memory verifier.
   */
  verifyNonce?: NonceReplayVerifier;
}

const getHeaderString = (req: IRequest, name: string): string => {
  const header = req.getHeader(name);
  if (Array.isArray(header)) return typeof header[0] === 'string' ? header[0] : '';
  return typeof header === 'string' ? header : '';
};

const getBearerToken = (authorizationHeader: string): string | null => {
  const trimmed = authorizationHeader.trim();
  if (trimmed === '') return null;
  const [scheme, ...rest] = trimmed.split(/\s+/);
  if (typeof scheme !== 'string' || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token === '' ? null : token;
};

const pickOptionalStringClaim = (
  payload: JwtPayload,
  keys: readonly string[]
): string | undefined => {
  const record = payload as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
};

const toBodyForSigning = (req: IRequest): string | Uint8Array => {
  const rawText = req.context?.['rawBodyText'];
  if (typeof rawText === 'string') return rawText;

  const rawBytes = req.context?.['rawBodyBytes'];
  if (rawBytes instanceof Uint8Array) return rawBytes;
  if (rawBytes instanceof ArrayBuffer) return new Uint8Array(rawBytes);
  return '';
};

const toUrlForSigning = (req: IRequest): URL => {
  const raw = req.getRaw?.() as unknown as { url?: unknown };
  const rawUrl = typeof raw?.url === 'string' ? raw.url : undefined;
  const path = rawUrl ?? req.getPath?.() ?? '/';

  try {
    return new URL(path);
  } catch {
    return new URL(path.startsWith('/') ? path : `/${path}`, 'http://localhost');
  }
};

const markAuthContext = (req: IRequest, ctx: BulletproofAuthContext): void => {
  req.context ??= {};
  req.context['auth'] = ctx;
  req.context['authStrategy'] = 'bulletproof';
};

const respond401 = async (
  req: IRequest,
  res: IResponse,
  message: string,
  responder: MiddlewareFailureResponder | undefined,
  reason = 'unauthorized',
  error?: unknown
): Promise<void> => {
  await respondWithMiddlewareFailure(req, res, responder, {
    middleware: 'bulletproof',
    reason,
    statusCode: 401,
    message,
    body: { error: message },
    error,
  });
};

type ParsedBulletproofHeaders = {
  ok: true;
  deviceId: string;
  timezone: string;
  signingHeaders: Record<string, string | undefined>;
};

const parseBulletproofHeaders = (params: {
  req: IRequest;
  deviceIdHeader: string;
  timezoneHeader: string;
  requireDeviceId: boolean;
  requireTimezone: boolean;
}): ParsedBulletproofHeaders | { ok: false; message: string } => {
  const deviceId = getHeaderString(params.req, params.deviceIdHeader).trim();
  if (params.requireDeviceId) {
    const ok = isNonEmptyString(deviceId) && isMaxLength(deviceId, 128);
    if (!ok) return { ok: false, message: 'Missing or invalid device id' };
  }

  const timezone = getHeaderString(params.req, params.timezoneHeader).trim();
  if (params.requireTimezone) {
    const ok = isNonEmptyString(timezone) && isMaxLength(timezone, 64);
    if (!ok) return { ok: false, message: 'Missing or invalid timezone' };
  }

  const signingHeaders: Record<string, string | undefined> = {
    'x-zt-key-id': getHeaderString(params.req, 'x-zt-key-id').trim() || undefined,
    'x-zt-timestamp': getHeaderString(params.req, 'x-zt-timestamp').trim() || undefined,
    'x-zt-nonce': getHeaderString(params.req, 'x-zt-nonce').trim() || undefined,
    'x-zt-body-sha256': getHeaderString(params.req, 'x-zt-body-sha256').trim() || undefined,
    'x-zt-signature': getHeaderString(params.req, 'x-zt-signature').trim() || undefined,
  };

  return { ok: true, deviceId, timezone, signingHeaders };
};

type SignedRequestVerificationResult = Awaited<ReturnType<typeof SignedRequest.verify>>;

const isMissingDeviceStoreRegistration = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Database connection '") && error.message.includes('is not registered')
  );
};

const normalizeStaticSecrets = (staticSecrets?: readonly string[]): string[] => {
  return (
    staticSecrets?.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s !== '') ?? []
  );
};

const createDynamicSignedRequestAttempt = (params: {
  req: IRequest;
  baseParams: {
    method: string;
    url: URL;
    body: string | Uint8Array<ArrayBufferLike>;
    headers: Record<string, string | undefined>;
    nowMs: number;
    windowMs: number;
    verifyNonce: (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;
  };
  getSecretForKeyId: (
    keyId: string,
    req: IRequest
  ) => string | undefined | Promise<string | undefined>;
  hasStaticFallback: boolean;
}): (() => Promise<SignedRequestVerificationResult>) => {
  return async () => {
    try {
      return await SignedRequest.verify({
        ...params.baseParams,
        getSecretForKeyId: async (keyId: string): Promise<string | undefined> => {
          const secretForKey = await params.getSecretForKeyId(keyId, params.req);
          const normalized = typeof secretForKey === 'string' ? secretForKey.trim() : '';
          return normalized === '' ? undefined : normalized;
        },
      });
    } catch (error) {
      if (params.hasStaticFallback && isMissingDeviceStoreRegistration(error)) {
        return { ok: false, code: 'UNKNOWN_KEY', message: 'Unknown key' } as const;
      }

      throw error;
    }
  };
};

const collectSignedRequestAttempts = async (params: {
  req: IRequest;
  baseParams: {
    method: string;
    url: URL;
    body: string | Uint8Array<ArrayBufferLike>;
    headers: Record<string, string | undefined>;
    nowMs: number;
    windowMs: number;
    verifyNonce: (keyId: string, nonce: string, ttlMs: number) => Promise<boolean>;
  };
  getSecretForKeyId: SecretForKeyResolver;
  staticSecrets?: readonly string[];
}): Promise<SignedRequestVerificationResult[]> => {
  const staticSecrets = normalizeStaticSecrets(params.staticSecrets);
  const attemptResolvers: Array<() => Promise<SignedRequestVerificationResult>> = [
    createDynamicSignedRequestAttempt({
      req: params.req,
      baseParams: params.baseParams,
      getSecretForKeyId: params.getSecretForKeyId,
      hasStaticFallback: staticSecrets.length > 0,
    }),
    ...staticSecrets.map((secret) => async (): Promise<SignedRequestVerificationResult> => {
      return SignedRequest.verify({
        ...params.baseParams,
        getSecretForKeyId: (): string => secret,
      });
    }),
  ];

  return Promise.all(attemptResolvers.map(async (attemptResolver) => attemptResolver()));
};

const verifySignedRequest = async (params: {
  req: IRequest;
  signingHeaders: Record<string, string | undefined>;
  windowMs: number;
  verifyNonce: NonceReplayVerifier;
  getSecretForKeyId: SecretForKeyResolver;
  staticSecrets?: readonly string[];
}): Promise<
  { ok: true; keyId: string; timestampMs: number; nonce: string } | { ok: false; message: string }
> => {
  const baseParams = {
    method: params.req.getMethod?.() ?? 'GET',
    url: toUrlForSigning(params.req),
    body: toBodyForSigning(params.req),
    headers: params.signingHeaders,
    nowMs: Date.now(),
    windowMs: params.windowMs,
    verifyNonce: async (keyId: string, nonce: string, ttlMs: number): Promise<boolean> => {
      const ok = isNonEmptyString(nonce) && isMinLength(nonce, 8) && isMaxLength(nonce, 128);
      if (!ok) return false;
      return params.verifyNonce(keyId, nonce, ttlMs);
    },
  } as const;

  const attempts = await collectSignedRequestAttempts({
    req: params.req,
    baseParams,
    getSecretForKeyId: params.getSecretForKeyId,
    staticSecrets: params.staticSecrets,
  });

  let signed = attempts[0];

  for (const attempt of attempts) {
    if (attempt.ok === true) {
      signed = attempt;
      break;
    }
  }

  if (signed.ok !== true) {
    const nonSignatureFailure = attempts.find(
      (attempt) => attempt.ok === false && attempt.code !== 'INVALID_SIGNATURE'
    );

    if (nonSignatureFailure !== undefined) {
      signed = nonSignatureFailure;
    }
  }

  if (!signed.ok) {
    Logger.debug('Bulletproof auth signed-request verification failed', {
      code: signed.code,
      message: signed.message,
    });
    return { ok: false, message: 'Unauthorized' };
  }

  return {
    ok: true,
    keyId: signed.keyId,
    timestampMs: signed.timestampMs,
    nonce: signed.nonce,
  };
};

const verifyJwtPayload = (params: {
  jwt: ReturnType<typeof JwtManager.create>;
  token: string;
  algorithm: JwtAlgorithm;
}): { ok: true; payload: JwtPayload } | { ok: false } => {
  try {
    return { ok: true, payload: params.jwt.verify(params.token, params.algorithm) };
  } catch (error) {
    Logger.debug('Bulletproof auth JWT verification failed', {
      algorithm: params.algorithm,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false };
  }
};

const enforceDeviceBindings = (params: {
  payload: JwtPayload;
  deviceId: string;
  keyId: string;
  requireDeviceId: boolean;
  requireDeviceClaimMatch: boolean;
  deviceClaimKeys: readonly string[];
}): { ok: true } | { ok: false; message: string } => {
  if (params.requireDeviceId && params.deviceId !== '' && params.deviceId !== params.keyId) {
    return { ok: false, message: 'Device mismatch' };
  }

  if (params.requireDeviceClaimMatch) {
    const claimedDevice = pickOptionalStringClaim(params.payload, params.deviceClaimKeys);
    const mismatch =
      claimedDevice === undefined || (params.deviceId !== '' && claimedDevice !== params.deviceId);
    if (mismatch) return { ok: false, message: 'Device mismatch' };
  }

  return { ok: true };
};

const enforceTimezoneBindings = (params: {
  payload: JwtPayload;
  timezone: string;
  requireTimezoneClaimMatch: boolean;
  timezoneClaimKeys: readonly string[];
}): { ok: true } | { ok: false; message: string } => {
  if (!params.requireTimezoneClaimMatch || params.timezone === '') {
    return { ok: true };
  }

  const claimedTimezone = pickOptionalStringClaim(params.payload, params.timezoneClaimKeys);
  if (claimedTimezone !== undefined && claimedTimezone !== params.timezone) {
    return { ok: false, message: 'Timezone mismatch' };
  }

  return { ok: true };
};

const enforceUserAgentBindings = async (params: {
  req: IRequest;
  payload: JwtPayload;
  requireUserAgentHashMatch: boolean;
  userAgentHashClaimKeys: readonly string[];
}): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (!params.requireUserAgentHashMatch) return { ok: true };

  const claimedUaHash = pickOptionalStringClaim(params.payload, params.userAgentHashClaimKeys);
  if (claimedUaHash === undefined) return { ok: true };

  const userAgent = getHeaderString(params.req, 'user-agent').trim();
  const uaHash = await SignedRequest.sha256Hex(userAgent);
  if (uaHash !== claimedUaHash) {
    return { ok: false, message: 'User agent mismatch' };
  }
  return { ok: true };
};

const enforceJwtBindings = async (params: {
  req: IRequest;
  payload: JwtPayload;
  deviceId: string;
  timezone: string;
  keyId: string;
  requireDeviceId: boolean;
  requireDeviceClaimMatch: boolean;
  deviceClaimKeys: readonly string[];
  requireTimezoneClaimMatch: boolean;
  timezoneClaimKeys: readonly string[];
  requireUserAgentHashMatch: boolean;
  userAgentHashClaimKeys: readonly string[];
}): Promise<{ ok: true } | { ok: false; message: string }> => {
  const device = enforceDeviceBindings({
    payload: params.payload,
    deviceId: params.deviceId,
    keyId: params.keyId,
    requireDeviceId: params.requireDeviceId,
    requireDeviceClaimMatch: params.requireDeviceClaimMatch,
    deviceClaimKeys: params.deviceClaimKeys,
  });
  if (!device.ok) return device;

  const tz = enforceTimezoneBindings({
    payload: params.payload,
    timezone: params.timezone,
    requireTimezoneClaimMatch: params.requireTimezoneClaimMatch,
    timezoneClaimKeys: params.timezoneClaimKeys,
  });
  if (!tz.ok) return tz;

  return enforceUserAgentBindings({
    req: params.req,
    payload: params.payload,
    requireUserAgentHashMatch: params.requireUserAgentHashMatch,
    userAgentHashClaimKeys: params.userAgentHashClaimKeys,
  });
};

type BulletproofResolved = {
  algorithm: JwtAlgorithm;
  jwt: ReturnType<typeof JwtManager.create>;
  windowMs: number;
  deviceIdHeader: string;
  timezoneHeader: string;
  requireDeviceId: boolean;
  requireDeviceClaimMatch: boolean;
  deviceClaimKeys: readonly string[];
  requireTimezone: boolean;
  requireTimezoneClaimMatch: boolean;
  timezoneClaimKeys: readonly string[];
  requireUserAgentHashMatch: boolean;
  userAgentHashClaimKeys: readonly string[];
  getSecretForKeyId: SecretForKeyResolver;
  verifyNonce: NonceReplayVerifier;
  staticSigningSecrets?: readonly string[];
};

const resolveJwtVerifier = (
  options: BulletproofAuthOptions
): {
  algorithm: JwtAlgorithm;
  jwt: ReturnType<typeof JwtManager.create>;
  windowMs: number;
} => {
  const algorithm = options.algorithm ?? securityConfig.jwt.algorithm;
  const secret = options.secret ?? securityConfig.jwt.secret;
  const windowMs = options.windowMs ?? 60_000;

  const jwt = JwtManager.create();
  if (algorithm === 'HS256' || algorithm === 'HS512') {
    jwt.setHmacSecret(secret);
  }

  return { algorithm, jwt, windowMs };
};

const resolveHeaderConfig = (
  options: BulletproofAuthOptions
): {
  deviceIdHeader: string;
  timezoneHeader: string;
  requireDeviceId: boolean;
  requireTimezone: boolean;
} => {
  return {
    deviceIdHeader: (options.deviceIdHeader ?? 'x-zt-device-id').toLowerCase(),
    timezoneHeader: (options.timezoneHeader ?? 'x-zt-timezone').toLowerCase(),
    requireDeviceId: options.requireDeviceId ?? true,
    requireTimezone: options.requireTimezone ?? false,
  };
};

const resolveClaimConfig = (
  options: BulletproofAuthOptions
): {
  requireDeviceClaimMatch: boolean;
  deviceClaimKeys: readonly string[];
  requireTimezoneClaimMatch: boolean;
  timezoneClaimKeys: readonly string[];
  requireUserAgentHashMatch: boolean;
  userAgentHashClaimKeys: readonly string[];
} => {
  return {
    requireDeviceClaimMatch: options.requireDeviceClaimMatch ?? true,
    deviceClaimKeys: options.deviceClaimKeys ?? (['deviceId', 'device_id', 'did'] as const),
    requireTimezoneClaimMatch: options.requireTimezoneClaimMatch ?? true,
    timezoneClaimKeys: options.timezoneClaimKeys ?? (['tz', 'timezone', 'timeZone'] as const),
    requireUserAgentHashMatch: options.requireUserAgentHashMatch ?? true,
    userAgentHashClaimKeys:
      options.userAgentHashClaimKeys ?? (['uaHash', 'uah', 'userAgentHash'] as const),
  };
};

const parseBackupSecrets = (raw: string): string[] => {
  const value = raw.trim();
  if (value === '') return [];

  // JSON array support: ["a","b"]
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim())
        .filter((s) => s !== '');
    } catch {
      return [];
    }
  }

  // Comma-separated support: a,b,c
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
};

const dedupeSecrets = (secrets: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const secret of secrets) {
    const trimmed = typeof secret === 'string' ? secret.trim() : '';
    if (trimmed === '') continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

const resolveSigningConfig = (
  options: BulletproofAuthOptions
): {
  getSecretForKeyId: BulletproofResolved['getSecretForKeyId'];
  verifyNonce: NonceReplayVerifier;
  staticSigningSecrets?: readonly string[];
} => {
  const appKeyFallback = (Env.get('AUTH_KEY', '') || Env.get('APP_KEY', '')).trim();
  const signingSecretFromEnv = Env.get('BULLETPROOF_SIGNING_SECRET', appKeyFallback).trim();
  const signingSecret = (options.signingSecret ?? signingSecretFromEnv).trim();

  const backupSecrets = parseBackupSecrets(Env.get('BULLETPROOF_SIGNING_SECRET_BK', ''));

  const hasCustomResolver = typeof options.getSecretForKeyId === 'function';
  const getSecretForKeyId = hasCustomResolver
    ? (options.getSecretForKeyId as BulletproofResolved['getSecretForKeyId'])
    : async (keyId: string): Promise<string | undefined> => {
        const fallbackSecret = dedupeSecrets([signingSecret, ...backupSecrets])[0];

        let device;
        try {
          device = await BulletproofDeviceStore.findByDeviceId(keyId);
        } catch (error) {
          if (fallbackSecret !== undefined && isMissingDeviceStoreRegistration(error)) {
            return fallbackSecret;
          }

          throw error;
        }

        if (device && typeof device.signingSecret === 'string' && device.signingSecret !== '') {
          return device.signingSecret;
        }

        return fallbackSecret === undefined || fallbackSecret === '' ? undefined : fallbackSecret;
      };

  const verifyNonce: NonceReplayVerifier =
    options.verifyNonce ?? NonceReplay.createMemoryVerifier();

  const staticSigningSecrets = hasCustomResolver ? undefined : dedupeSecrets(backupSecrets);

  return { getSecretForKeyId, verifyNonce, staticSigningSecrets };
};

const resolveBulletproof = (options: BulletproofAuthOptions): BulletproofResolved => {
  return {
    ...resolveJwtVerifier(options),
    ...resolveHeaderConfig(options),
    ...resolveClaimConfig(options),
    ...resolveSigningConfig(options),
  };
};

type AuthOk = {
  ok: true;
  token: string;
  payload: JwtPayload;
  parsed: ParsedBulletproofHeaders;
  signed: { keyId: string; timestampMs: number; nonce: string };
};

type AuthFail = { ok: false; message: string };

const getTokenOrFail = (req: IRequest): { ok: true; token: string } | AuthFail => {
  const authorizationHeader = getHeaderString(req, 'authorization');
  if (authorizationHeader === '') return { ok: false, message: 'Missing authorization header' };

  const token = getBearerToken(authorizationHeader);
  if (token === null) return { ok: false, message: 'Invalid authorization header format' };
  return { ok: true, token };
};

const authenticate = async (params: {
  req: IRequest;
  resolved: BulletproofResolved;
}): Promise<AuthOk | AuthFail> => {
  const tokenResult = getTokenOrFail(params.req);
  if (!tokenResult.ok) return tokenResult;

  const parsed = parseBulletproofHeaders({
    req: params.req,
    deviceIdHeader: params.resolved.deviceIdHeader,
    timezoneHeader: params.resolved.timezoneHeader,
    requireDeviceId: params.resolved.requireDeviceId,
    requireTimezone: params.resolved.requireTimezone,
  });
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const signed = await verifySignedRequest({
    req: params.req,
    signingHeaders: parsed.signingHeaders,
    windowMs: params.resolved.windowMs,
    verifyNonce: params.resolved.verifyNonce,
    getSecretForKeyId: params.resolved.getSecretForKeyId,
    staticSecrets: params.resolved.staticSigningSecrets,
  });
  if (!signed.ok) return { ok: false, message: signed.message };

  const jwtResult = verifyJwtPayload({
    jwt: params.resolved.jwt,
    token: tokenResult.token,
    algorithm: params.resolved.algorithm,
  });
  if (!jwtResult.ok) return { ok: false, message: 'Invalid or expired token' };

  // Session allowlist: token must exist in the sessions store to be accepted.
  if (!(await JwtSessions.isActive(tokenResult.token))) {
    return { ok: false, message: 'Invalid or expired token' };
  }

  const binding = await enforceJwtBindings({
    req: params.req,
    payload: jwtResult.payload,
    deviceId: parsed.deviceId,
    timezone: parsed.timezone,
    keyId: signed.keyId,
    requireDeviceId: params.resolved.requireDeviceId,
    requireDeviceClaimMatch: params.resolved.requireDeviceClaimMatch,
    deviceClaimKeys: params.resolved.deviceClaimKeys,
    requireTimezoneClaimMatch: params.resolved.requireTimezoneClaimMatch,
    timezoneClaimKeys: params.resolved.timezoneClaimKeys,
    requireUserAgentHashMatch: params.resolved.requireUserAgentHashMatch,
    userAgentHashClaimKeys: params.resolved.userAgentHashClaimKeys,
  });
  if (!binding.ok) return { ok: false, message: binding.message };

  return {
    ok: true,
    token: tokenResult.token,
    payload: jwtResult.payload,
    parsed,
    signed,
  };
};

const attachAuth = (req: IRequest, result: AuthOk): void => {
  req.user = result.payload;

  if (typeof result.payload.sub === 'string' && result.payload.sub.trim() !== '') {
    RequestContext.setUserId(req, result.payload.sub);
  }

  const anyPayload = result.payload as unknown as Record<string, unknown>;
  const tenantId = anyPayload['tenantId'] ?? anyPayload['tenant_id'];
  if (
    (typeof tenantId === 'string' && tenantId.trim() !== '') ||
    (typeof tenantId === 'number' && Number.isFinite(tenantId))
  ) {
    RequestContext.setTenantId(req, String(tenantId));
  }

  markAuthContext(req, {
    strategy: 'bulletproof',
    deviceId: result.parsed.deviceId === '' ? result.signed.keyId : result.parsed.deviceId,
    keyId: result.signed.keyId,
    signedRequest: {
      timestampMs: result.signed.timestampMs,
      nonce: result.signed.nonce,
    },
  });

  if (result.parsed.timezone !== '') {
    req.context ??= {};
    req.context['timezone'] = result.parsed.timezone;
  }
};

const createHandler = (
  resolved: BulletproofResolved,
  onUnauthorized: MiddlewareFailureResponder | undefined
): Middleware => {
  return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
    if (req.context?.['authStrategy'] === 'bulletproof' && req.user !== undefined) {
      await next();
      return;
    }

    const result = await authenticate({ req, resolved });
    if (!result.ok) {
      await respond401(req, res, result.message, onUnauthorized);
      return;
    }

    attachAuth(req, result);
    await next();
  };
};

export const BulletproofAuthMiddleware = Object.freeze({
  create(options: BulletproofAuthOptions = {}): Middleware {
    const resolved = resolveBulletproof(options);
    return createHandler(resolved, options.onUnauthorized);
  },
});

export default BulletproofAuthMiddleware;
