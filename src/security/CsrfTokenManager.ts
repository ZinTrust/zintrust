/**
 * CSRF Token Manager
 * Generate, validate, and bind CSRF tokens to sessions
 */

import { Env } from '@config/env';
import { randomBytes } from 'node:crypto';

export interface CsrfTokenData {
  token: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ICsrfTokenManager {
  generateToken(sessionId: string): string;
  validateToken(sessionId: string, token: string): boolean;
  invalidateToken(sessionId: string): void;
  getTokenData(sessionId: string): CsrfTokenData | null;
  refreshToken(sessionId: string): string | null;
  cleanup(): number;
  clear(): void;
  getTokenCount(): number;
}

export interface CsrfTokenManagerType {
  create(): ICsrfTokenManager;
}

/**
 * Create a new CSRF token manager instance
 */
const create = (): ICsrfTokenManager => {
  const tokens: Map<string, CsrfTokenData> = new Map();
  const tokenLength = Env.TOKEN_LENGTH; // 256 bits
  const tokenTtl = Env.TOKEN_TTL; // 1 hour in milliseconds

  return {
    generateToken(sessionId: string): string {
      tokens.delete(sessionId);
      const token = randomBytes(tokenLength).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + tokenTtl);
      const tokenData: CsrfTokenData = { token, sessionId, createdAt: now, expiresAt };
      tokens.set(sessionId, tokenData);
      return token;
    },
    validateToken(sessionId: string, token: string): boolean {
      const tokenData = tokens.get(sessionId);
      if (!tokenData) return false;
      const isValid = tokenData.token === token;
      const isExpired = new Date() > tokenData.expiresAt;
      if (isExpired) {
        tokens.delete(sessionId);
        return false;
      }
      return isValid;
    },
    invalidateToken(sessionId: string): void {
      tokens.delete(sessionId);
    },
    getTokenData(sessionId: string): CsrfTokenData | null {
      return tokens.get(sessionId) ?? null;
    },
    refreshToken(sessionId: string): string | null {
      const tokenData = tokens.get(sessionId);
      if (!tokenData) return null;
      const isExpired = new Date() > tokenData.expiresAt;
      if (isExpired) {
        tokens.delete(sessionId);
        return null;
      }
      tokenData.expiresAt = new Date(Date.now() + tokenTtl);
      return tokenData.token;
    },
    cleanup(): number {
      let removed = 0;
      const now = new Date();
      for (const [sessionId, tokenData] of tokens.entries()) {
        if (now > tokenData.expiresAt) {
          tokens.delete(sessionId);
          removed++;
        }
      }
      return removed;
    },
    clear(): void {
      tokens.clear();
    },
    getTokenCount(): number {
      return tokens.size;
    },
  };
};

/**
 * CsrfTokenManager namespace - sealed for immutability
 */
export const CsrfTokenManager: CsrfTokenManagerType = Object.freeze({
  create,
});
