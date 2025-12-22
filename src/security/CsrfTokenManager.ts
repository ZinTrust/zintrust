/**
 * CSRF Token Manager
 * Generate, validate, and bind CSRF tokens to sessions
 */

import { randomBytes } from 'node:crypto';

export interface CsrfTokenData {
  token: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * CsrfTokenManager handles CSRF token lifecycle
 */
export class CsrfTokenManager {
  private readonly tokens: Map<string, CsrfTokenData> = new Map();
  private readonly tokenLength: number = 32; // 256 bits
  private readonly tokenTtl: number = 3600000; // 1 hour in milliseconds

  /**
   * Generate a new CSRF token bound to session
   */
  public generateToken(sessionId: string): string {
    // Invalidate any existing token for this session
    this.tokens.delete(sessionId);

    const token = randomBytes(this.tokenLength).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.tokenTtl);

    const tokenData: CsrfTokenData = {
      token,
      sessionId,
      createdAt: now,
      expiresAt,
    };

    this.tokens.set(sessionId, tokenData);
    return token;
  }

  /**
   * Validate CSRF token for session
   */
  public validateToken(sessionId: string, token: string): boolean {
    const tokenData = this.tokens.get(sessionId);

    if (!tokenData) {
      return false;
    }

    const isValid = tokenData.token === token;
    const isExpired = new Date() > tokenData.expiresAt;

    if (isExpired) {
      this.tokens.delete(sessionId);
      return false;
    }

    if (!isValid) {
      return false;
    }

    // Token is valid, can be single-use or reusable
    // For production, consider single-use tokens
    return true;
  }

  /**
   * Invalidate token (single-use model)
   */
  public invalidateToken(sessionId: string): void {
    this.tokens.delete(sessionId);
  }

  /**
   * Get token data for session
   */
  public getTokenData(sessionId: string): CsrfTokenData | null {
    return this.tokens.get(sessionId) ?? null;
  }

  /**
   * Refresh token (extend TTL)
   */
  public refreshToken(sessionId: string): string | null {
    const tokenData = this.tokens.get(sessionId);

    if (!tokenData) {
      return null;
    }

    const isExpired = new Date() > tokenData.expiresAt;
    if (isExpired) {
      this.tokens.delete(sessionId);
      return null;
    }

    // Extend expiration
    tokenData.expiresAt = new Date(Date.now() + this.tokenTtl);
    return tokenData.token;
  }

  /**
   * Clean up expired tokens
   */
  public cleanup(): number {
    let removed = 0;
    const now = new Date();

    for (const [sessionId, tokenData] of this.tokens.entries()) {
      if (now > tokenData.expiresAt) {
        this.tokens.delete(sessionId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all tokens (for testing)
   */
  public clear(): void {
    this.tokens.clear();
  }

  /**
   * Get active token count
   */
  public getTokenCount(): number {
    return this.tokens.size;
  }
}
