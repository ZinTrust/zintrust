import type { IRequest } from '@zintrust/core/http';

/**
 * Helper to get path parameter
 */
export const getParam = (req: IRequest, key: string): string => {
  const direct = req.getParam?.(key);
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const params = (req.params as Record<string, string> | undefined) ?? {};
  return params[key] ?? '';
};

/**
 * Mask password in a record if present
 */
const maskPassword = (obj: Record<string, unknown>): void => {
  if (typeof obj['password'] === 'string' && obj['password'].length > 0) {
    obj['password'] = '******';
  }
};

/**
 * Mask passwords in a nested connection object
 */
const maskConnectionPassword = (persistence: Record<string, unknown>): void => {
  if (typeof persistence['connection'] === 'object' && persistence['connection'] !== null) {
    const connection = { ...(persistence['connection'] as Record<string, unknown>) };
    maskPassword(connection);
    persistence['connection'] = connection;
  }
};

/**
 * Mask Redis password in infrastructure data
 */
const maskRedisPassword = (masked: Record<string, unknown>): void => {
  if (typeof masked['redis'] === 'object' && masked['redis'] !== null) {
    const redis = { ...(masked['redis'] as Record<string, unknown>) };
    maskPassword(redis);
    masked['redis'] = redis;
  }
};

/**
 * Mask persistence password in infrastructure data
 */
const maskPersistencePassword = (masked: Record<string, unknown>): void => {
  if (typeof masked['persistence'] === 'object' && masked['persistence'] !== null) {
    const persistence = { ...(masked['persistence'] as Record<string, unknown>) };
    maskPassword(persistence);
    maskConnectionPassword(persistence);
    masked['persistence'] = persistence;
  }
};

/**
 * Mask sensitive password fields in infrastructure data
 * This masks both Redis and database passwords to prevent them from being exposed in API responses
 */
export const maskInfrastructurePasswords = (
  infrastructure: Record<string, unknown> | null | undefined
): Record<string, unknown> | null => {
  if (!infrastructure) return null;

  const masked = { ...infrastructure };

  maskRedisPassword(masked);
  maskPersistencePassword(masked);

  return masked;
};
