/**
 * JWT Manager
 * JSON Web Token generation, verification, and claims management
 * Uses native Node.js crypto module (zero external dependencies)
 */

import { Logger } from '@config/logger';
import { createHmac, createSign, createVerify, randomBytes } from 'node:crypto';

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
  algorithm?: 'HS256' | 'HS512' | 'RS256';
  expiresIn?: number; // Seconds
  issuer?: string;
  audience?: string;
  subject?: string;
  jwtId?: string;
}

/**
 * JwtManager handles JWT lifecycle
 */
export class JwtManager {
  private hmacSecret: string | null = null;
  private rsaPrivateKey: string | null = null;
  private rsaPublicKey: string | null = null;

  /**
   * Configure with HMAC secret
   */
  public setHmacSecret(secret: string): void {
    this.hmacSecret = secret;
  }

  /**
   * Configure with RSA keys
   */
  public setRsaKeys(privateKey: string, publicKey: string): void {
    this.rsaPrivateKey = privateKey;
    this.rsaPublicKey = publicKey;
  }

  /**
   * Generate JWT token
   */
  public sign(payload: JwtPayload, options: JwtOptions = {}): string {
    const algorithm = options.algorithm ?? 'HS256';
    const now = Math.floor(Date.now() / 1000);

    // Build claims
    const claims: JwtPayload = {
      ...payload,
      iat: now,
    };

    if (options.expiresIn != null) {
      claims.exp = now + options.expiresIn;
    }

    if (options.issuer != null) {
      claims.iss = options.issuer;
    }

    if (options.audience != null) {
      claims.aud = options.audience;
    }

    if (options.subject != null) {
      claims.sub = options.subject;
    }

    if (options.jwtId != null) {
      claims.jti = options.jwtId;
    }

    // Encode header and payload
    const header = {
      alg: algorithm,
      typ: 'JWT',
    };

    const encodedHeader = this.base64Encode(JSON.stringify(header));
    const encodedPayload = this.base64Encode(JSON.stringify(claims));
    const message = `${encodedHeader}.${encodedPayload}`;

    // Sign
    let signature: string;

    if (algorithm.startsWith('HS')) {
      if (this.hmacSecret == null) {
        throw new Error('HMAC secret not configured');
      }
      signature = this.signHmac(message, algorithm as 'HS256' | 'HS512');
    } else if (algorithm === 'RS256') {
      if (this.rsaPrivateKey == null) {
        throw new Error('RSA private key not configured');
      }
      signature = this.signRsa(message);
    } else {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    return `${message}.${signature}`;
  }

  /**
   * Verify JWT token
   */
  public verify(token: string, algorithm: 'HS256' | 'HS512' | 'RS256' = 'HS256'): JwtPayload {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    try {
      // Decode and verify header
      const header = JSON.parse(this.base64Decode(encodedHeader));
      if (header.alg !== algorithm) {
        throw new Error(`Algorithm mismatch: expected ${algorithm}, got ${header.alg}`);
      }

      // Verify signature
      const message = `${encodedHeader}.${encodedPayload}`;
      const isValid = this.verifySignature(message, encodedSignature, algorithm);

      if (!isValid) {
        throw new Error('Invalid signature');
      }

      // Decode payload
      const payload = JSON.parse(this.base64Decode(encodedPayload)) as JwtPayload;

      // Verify claims
      this.verifyClaims(payload);

      return payload;
    } catch (error) {
      Logger.error('JWT verification failed', error);
      throw new Error(`Token verification failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decode token without verification
   */
  public decode(token: string): JwtPayload {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    try {
      const payload = JSON.parse(this.base64Decode(parts[1])) as JwtPayload;
      return payload;
    } catch (error) {
      Logger.error('JWT decode failed', error);
      throw new Error(`Invalid token payload: ${(error as Error).message}`);
    }
  }

  /**
   * Generate random JWT ID
   */
  public generateJwtId(): string {
    return randomBytes(16).toString('hex');
  }

  private signHmac(message: string, algorithm: 'HS256' | 'HS512'): string {
    if (this.hmacSecret == null) {
      throw new Error('HMAC secret not configured');
    }

    const digestAlgorithm = algorithm === 'HS256' ? 'sha256' : 'sha512';
    const signature = createHmac(digestAlgorithm, this.hmacSecret).update(message).digest();

    return this.base64Encode(signature);
  }

  private signRsa(message: string): string {
    if (this.rsaPrivateKey == null) {
      throw new Error('RSA private key not configured');
    }

    const sign = createSign('RSA-SHA256');
    sign.update(message);
    const signature = sign.sign(this.rsaPrivateKey);

    return this.base64Encode(signature);
  }

  private verifySignature(message: string, encodedSignature: string, algorithm: string): boolean {
    if (algorithm.startsWith('HS')) {
      const expectedSignature = this.signHmac(message, algorithm as 'HS256' | 'HS512');
      return this.timingSafeEquals(encodedSignature, expectedSignature);
    } else if (algorithm === 'RS256') {
      if (this.rsaPublicKey == null) {
        throw new Error('RSA public key not configured');
      }
      const verify = createVerify('RSA-SHA256'); // NOSONAR
      verify.update(message);
      const signature = Buffer.from(this.base64Decode(encodedSignature), 'binary');
      return verify.verify(this.rsaPublicKey, signature);
    }

    return false;
  }

  private verifyClaims(payload: JwtPayload): void {
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (payload.exp != null && payload.exp <= now) {
      throw new Error('Token expired');
    }

    // Check not before
    if (payload.nbf != null && payload.nbf > now) {
      throw new Error('Token not yet valid');
    }
  }

  private base64Encode(data: string | Buffer): string {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  }

  private base64Decode(data: string): string {
    const padded = data + '==='.slice((data.length + 3) % 4);
    const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  private timingSafeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
    }

    return result === 0;
  }
}
