/**
 * JWT Manager
 * JSON Web Token generation, verification, and claims management
 * Uses native Node.js crypto module (zero external dependencies)
 */

import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { securityConfig } from '@config/security';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHmac, createSign, createVerify, randomBytes } from '@node-singletons/crypto';
import type { AuthorizationHeader } from '@security/JwtSessions';
import { JwtSessions } from '@security/JwtSessions';

export type JwtAlgorithm = 'HS256' | 'HS512' | 'RS256';

export interface JwtPayload {
  sub?: string; // Subject
  iss?: string; // Issuer
  aud?: string; // Audience
  exp?: number; // Expiration time
  iat?: number; // Issued at
  nbf?: number; // Not before
  jti?: string; // JWT ID
  [key: string]: unknown;
}

export interface JwtOptions {
  algorithm?: JwtAlgorithm;
  expiresIn?: number; // Seconds
  issuer?: string;
  audience?: string;
  subject?: string;
  jwtId?: string;
}

export interface IJwtManager {
  setHmacSecret(secret: string): void;
  setRsaKeys(privateKey: string, publicKey: string): void;
  sign(payload: JwtPayload, options?: JwtOptions): string;
  verify(token: string, algorithm?: JwtAlgorithm): JwtPayload;
  decode(token: string): JwtPayload;
  signRsa(message: string): string;
  generateJwtId(): string;
}

interface JwtState {
  hmacSecret: string | null;
  rsaPrivateKey: string | null;
  rsaPublicKey: string | null;
}

export interface JwtManagerType {
  create(): IJwtManager;
  signAccessToken: (payload: JwtPayload, expiresIn?: number) => Promise<string>;
  logout: (authHeader: AuthorizationHeader) => Promise<void>;
  logoutAll: (sub: string) => Promise<void>;
}

const createJwt = (): IJwtManager => {
  const algorithm = securityConfig.jwt.algorithm;
  const secret = securityConfig.jwt.secret;

  const jwt: IJwtManager = JwtManager.create();

  if (algorithm === 'HS256' || algorithm === 'HS512') {
    jwt.setHmacSecret(secret);
  }

  return jwt;
};

const getAuthHeaderValue = (authHeader: AuthorizationHeader): string | undefined => {
  if (typeof authHeader === 'string') return authHeader;
  if (Array.isArray(authHeader)) return authHeader[0];
  return undefined;
};

const getLogoutSubject = (authHeader: AuthorizationHeader): string | undefined => {
  const rawHeader = getAuthHeaderValue(authHeader)?.trim() ?? '';
  if (rawHeader === '') return undefined;

  const bearerToken = rawHeader.toLowerCase().startsWith('bearer ')
    ? rawHeader.slice(7).trim()
    : rawHeader;
  if (bearerToken === '') return undefined;

  try {
    const payload = JwtManager.create().decode(bearerToken);
    return typeof payload.sub === 'string' && payload.sub.trim() !== '' ? payload.sub : undefined;
  } catch {
    return undefined;
  }
};

const logout = async (authHeader: AuthorizationHeader): Promise<void> => {
  const subject = getLogoutSubject(authHeader);
  await JwtSessions.logout(authHeader);
  SystemTraceBridge.emitAuth('logout', subject);
};

const logoutAll = async (sub: string): Promise<void> => {
  await JwtSessions.logoutAll(sub);
  SystemTraceBridge.emitAuth('logout', sub);
};

const signAccessToken = async (payload: JwtPayload, expiresIn?: number): Promise<string> => {
  const algorithm = securityConfig.jwt.algorithm;

  const jwt = createJwt();

  let token;
  // JwtManager currently supports HMAC secrets directly for HS algorithms.
  // For other algorithms, verify will still reject mismatched tokens.
  if (algorithm !== 'HS256' && algorithm !== 'HS512') {
    token = jwt.sign(payload, {
      algorithm,
      issuer: securityConfig.jwt.issuer,
      audience: securityConfig.jwt.audience,
      jwtId: jwt.generateJwtId(),
    });
  } else {
    token = jwt.sign(payload, {
      algorithm,
      expiresIn: expiresIn ?? securityConfig.jwt.expiresIn,
      issuer: securityConfig.jwt.issuer,
      audience: securityConfig.jwt.audience,
      subject: typeof payload.sub === 'string' ? payload.sub : undefined,
      jwtId: jwt.generateJwtId(),
    });
  }

  await JwtSessions.register(token);
  SystemTraceBridge.emitAuth('login', typeof payload.sub === 'string' ? payload.sub : undefined);
  return token;
};

/**
 * Create a new JWT manager instance
 */
const create = (): IJwtManager => {
  const state: JwtState = {
    hmacSecret: null,
    rsaPrivateKey: null,
    rsaPublicKey: null,
  };

  return {
    setHmacSecret(secret: string): void {
      state.hmacSecret = secret;
    },
    setRsaKeys(privateKey: string, publicKey: string): void {
      state.rsaPrivateKey = privateKey;
      state.rsaPublicKey = publicKey;
    },
    sign(payload: JwtPayload, options: JwtOptions = {}): string {
      return signToken(state, payload, options);
    },
    verify(token: string, algorithm: 'HS256' | 'HS512' | 'RS256' = 'HS256'): JwtPayload {
      return verifyToken(state, token, algorithm);
    },
    decode(token: string): JwtPayload {
      return decodeToken(token);
    },
    signRsa(message: string): string {
      return signRsa(message, state.rsaPrivateKey);
    },
    generateJwtId(): string {
      return randomBytes(16).toString('hex');
    },
  };
};

/**
 * JwtManager namespace - sealed for immutability
 */
export const JwtManager: JwtManagerType = Object.freeze({
  create,
  signAccessToken,
  logout,
  logoutAll,
});

/**
 * Sign JWT token
 */
function signToken(state: JwtState, payload: JwtPayload, options: JwtOptions): string {
  const algorithm = options.algorithm ?? 'HS256';
  const now = Math.floor(Date.now() / 1000);
  const claims = buildClaims(payload, options, now);
  const header = { alg: algorithm, typ: 'JWT' };
  const encodedHeader = base64Encode(JSON.stringify(header));
  const encodedPayload = base64Encode(JSON.stringify(claims));
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = generateSignature(message, algorithm, state.hmacSecret, state.rsaPrivateKey);
  return `${message}.${signature}`;
}

/**
 * Verify JWT token
 */
function verifyToken(
  state: JwtState,
  token: string,
  algorithm: 'HS256' | 'HS512' | 'RS256'
): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw ErrorFactory.createSecurityError('Invalid token format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const header = <Record<string, unknown>>JSON.parse(base64Decode(encodedHeader));
    if (header['alg'] !== algorithm) {
      throw ErrorFactory.createSecurityError(
        `Algorithm mismatch: expected ${algorithm}, got ${header['alg']}`
      );
    }

    const message = `${encodedHeader}.${encodedPayload}`;
    const isValid = verifySignature(
      message,
      encodedSignature,
      algorithm,
      state.hmacSecret,
      state.rsaPublicKey
    );

    if (!isValid) {
      throw ErrorFactory.createSecurityError('Invalid signature');
    }

    const payload = JSON.parse(base64Decode(encodedPayload)) as JwtPayload;
    verifyClaims(payload);
    return payload;
  } catch (error) {
    throw ErrorFactory.createSecurityError(
      `Token verification failed: ${(error as Error).message}`
    );
  }
}

/**
 * Decode JWT token without verification
 */
function decodeToken(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw ErrorFactory.createSecurityError('Invalid token format');
  }

  try {
    const payload = JSON.parse(base64Decode(parts[1])) as JwtPayload;
    return payload;
  } catch (error) {
    throw ErrorFactory.createSecurityError(`Invalid token payload: ${(error as Error).message}`);
  }
}

/**
 * Base64 URL encoding
 */
function base64Encode(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Base64 URL decoding to Buffer
 */
function base64DecodeBuffer(data: string): Buffer {
  const padded = data + '==='.slice((data.length + 3) % 4);
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Base64 URL decoding to string
 */
function base64Decode(data: string): string {
  return base64DecodeBuffer(data).toString('utf8');
}

/**
 * Timing safe string comparison
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }

  return result === 0;
}

/**
 * Sign message using HMAC
 */
function signHmac(message: string, algorithm: 'HS256' | 'HS512', secret: string | null): string {
  if (secret === null) {
    throw ErrorFactory.createSecurityError('HMAC secret not configured');
  }

  const digestAlgorithm = algorithm === 'HS256' ? 'sha256' : 'sha512';
  const signature = createHmac(digestAlgorithm, secret).update(message).digest();

  return base64Encode(signature);
}

/**
 * Sign message using RSA
 */
function signRsa(message: string, privateKey: string | null): string {
  if (privateKey === null) {
    throw ErrorFactory.createSecurityError('RSA private key not configured');
  }

  const sign = createSign('RSA-SHA256');
  sign.update(message);
  const signature = sign.sign(privateKey);

  return base64Encode(signature);
}

/**
 * Generate signature based on algorithm
 */
function generateSignature(
  message: string,
  algorithm: string,
  hmacSecret: string | null,
  rsaPrivateKey: string | null
): string {
  if (algorithm.startsWith('HS')) {
    return signHmac(message, algorithm as 'HS256' | 'HS512', hmacSecret);
  }

  if (algorithm === 'RS256') {
    return signRsa(message, rsaPrivateKey);
  }

  throw ErrorFactory.createSecurityError(`Unsupported algorithm: ${algorithm}`);
}

/**
 * Verify signature based on algorithm
 */
function verifySignature(
  message: string,
  encodedSignature: string,
  algorithm: string,
  hmacSecret: string | null,
  rsaPublicKey: string | null
): boolean {
  if (algorithm.startsWith('HS')) {
    const expectedSignature = signHmac(message, algorithm as 'HS256' | 'HS512', hmacSecret);
    return timingSafeEquals(encodedSignature, expectedSignature);
  } else if (algorithm === 'RS256') {
    if (rsaPublicKey === null) {
      throw ErrorFactory.createSecurityError('RSA public key not configured');
    }
    const verify = createVerify('RSA-SHA256'); // NOSONAR LCHECK
    verify.update(message);
    const signature = base64DecodeBuffer(encodedSignature);
    return verify.verify(rsaPublicKey, signature);
  }

  return false;
}

/**
 * Build JWT claims
 */
function buildClaims(payload: JwtPayload, options: JwtOptions, now: number): JwtPayload {
  const claims: JwtPayload = {
    ...payload,
    iat: now,
  };

  if (options.expiresIn !== undefined && options.expiresIn !== null) {
    claims.exp = now + options.expiresIn;
  }

  if (options.issuer !== undefined && options.issuer !== null) {
    claims.iss = options.issuer;
  }

  if (options.audience !== undefined && options.audience !== null) {
    claims.aud = options.audience;
  }

  if (options.subject !== undefined && options.subject !== null) {
    claims.sub = options.subject;
  }

  if (options.jwtId !== undefined && options.jwtId !== null) {
    claims.jti = options.jwtId;
  }

  return claims;
}

/**
 * Verify JWT claims (expiration, not before)
 */
function verifyClaims(payload: JwtPayload): void {
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp !== undefined && payload.exp !== null && payload.exp <= now) {
    throw ErrorFactory.createSecurityError('Token expired');
  }

  if (payload.nbf !== undefined && payload.nbf !== null && payload.nbf > now) {
    throw ErrorFactory.createSecurityError('Token not yet valid');
  }
}
