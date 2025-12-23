/**
 * JWT Manager
 * JSON Web Token generation, verification, and claims management
 * Uses native Node.js crypto module (zero external dependencies)
 */

import { Logger } from '@config/logger';
import { createHmac, createSign, createVerify, randomBytes } from 'node:crypto';

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
}

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
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  try {
    const header = JSON.parse(base64Decode(encodedHeader));
    if (header.alg !== algorithm) {
      throw new Error(`Algorithm mismatch: expected ${algorithm}, got ${header.alg}`);
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
      throw new Error('Invalid signature');
    }

    const payload = JSON.parse(base64Decode(encodedPayload)) as JwtPayload;
    verifyClaims(payload);
    return payload;
  } catch (error) {
    Logger.error('JWT verification failed', error as Error);
    throw new Error(`Token verification failed: ${(error as Error).message}`);
  }
}

/**
 * Decode JWT token without verification
 */
function decodeToken(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  try {
    const payload = JSON.parse(base64Decode(parts[1])) as JwtPayload;
    return payload;
  } catch (error) {
    Logger.error('JWT decode failed', error as Error);
    throw new Error(`Invalid token payload: ${(error as Error).message}`);
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
    throw new Error('HMAC secret not configured');
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
    throw new Error('RSA private key not configured');
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

  throw new Error(`Unsupported algorithm: ${algorithm}`);
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
      throw new Error('RSA public key not configured');
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
    throw new Error('Token expired');
  }

  if (payload.nbf !== undefined && payload.nbf !== null && payload.nbf > now) {
    throw new Error('Token not yet valid');
  }
}
