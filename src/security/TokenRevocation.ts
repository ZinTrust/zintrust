import { securityConfig } from '@config/security';
import { JwtManager } from '@security/JwtManager';

type AuthorizationHeader = string | string[] | undefined;

const revokedTokens = new Map<string, number>();
const defaultTtlMs = Math.max(securityConfig.jwt.expiresIn * 1000, 60_000);

const getBearerToken = (header: AuthorizationHeader): string | null => {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return null;

  const [scheme, token] = value.trim().split(' ');
  if (scheme.toLowerCase() !== 'bearer') return null;
  if (typeof token !== 'string' || token.trim() === '') return null;

  return token;
};

const cleanupExpired = (): void => {
  const now = Date.now();
  for (const [token, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(token);
    }
  }
};

const resolveExpiryMs = (token: string): number => {
  try {
    const payload = JwtManager.create().decode(token);
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // ignore decode errors; fallback to default TTL
  }

  return Date.now() + defaultTtlMs;
};

export const TokenRevocation = Object.freeze({
  revoke(header: AuthorizationHeader): string | null {
    const token = getBearerToken(header);
    if (token === null) return null;

    cleanupExpired();
    revokedTokens.set(token, resolveExpiryMs(token));
    return token;
  },

  isRevoked(token: string): boolean {
    cleanupExpired();
    const expiresAt = revokedTokens.get(token);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      revokedTokens.delete(token);
      return false;
    }
    return true;
  },
});

export default TokenRevocation;
