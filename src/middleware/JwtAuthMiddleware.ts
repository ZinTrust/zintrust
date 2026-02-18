import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';
import type { IJwtManager, JwtAlgorithm } from '@security/JwtManager';
import { JwtManager } from '@security/JwtManager';
import { TokenRevocation } from '@security/TokenRevocation';

export interface JwtAuthOptions {
  algorithm?: JwtAlgorithm;
  secret?: string;
}

const getHeaderValue = (value: unknown): string => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
};

const getBearerToken = (authorizationHeader: string): string | null => {
  const trimmed = authorizationHeader.trim();
  if (trimmed === '') return null;

  const [scheme, ...rest] = trimmed.split(/\s+/);
  if (typeof scheme !== 'string' || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  if (token === '') return null;
  return token;
};

const getOptionalStringOrNumberClaim = (
  payload: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = payload[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
};

export const JwtAuthMiddleware = Object.freeze({
  create(options: JwtAuthOptions = {}): Middleware {
    const algorithm = options.algorithm ?? securityConfig.jwt.algorithm;
    const secret = options.secret ?? securityConfig.jwt.secret;

    const jwt: IJwtManager = JwtManager.create();
    if (algorithm === 'HS256' || algorithm === 'HS512') {
      jwt.setHmacSecret(secret);
    }

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const authorizationHeader = getHeaderValue(req.getHeader('authorization'));
      if (authorizationHeader === '') {
        res.setStatus(401).json({ error: 'Missing authorization header' });
        return;
      }

      const token = getBearerToken(authorizationHeader);
      if (token === null) {
        res.setStatus(401).json({ error: 'Invalid authorization header format' });
        return;
      }

      if (await TokenRevocation.isRevoked(token)) {
        res.setStatus(401).json({ error: 'Invalid or expired token' });
        return;
      }

      try {
        const payload = jwt.verify(token, algorithm);
        req.user = payload;

        // Standardize request-scoped context fields.
        if (typeof payload.sub === 'string' && payload.sub.trim() !== '') {
          RequestContext.setUserId(req, payload.sub);
        }

        // Optional: if a tenant claim exists, attach it. (Apps may use a different claim name.)
        const tenantId =
          getOptionalStringOrNumberClaim(
            payload as unknown as Record<string, unknown>,
            'tenantId'
          ) ??
          getOptionalStringOrNumberClaim(
            payload as unknown as Record<string, unknown>,
            'tenant_id'
          );
        if (tenantId !== undefined && tenantId.trim() !== '') {
          RequestContext.setTenantId(req, tenantId);
        }

        await next();
      } catch (error) {
        Logger.debug('JWT verification failed', {
          algorithm,
          error: error instanceof Error ? error.message : String(error),
        });
        res.setStatus(401).json({ error: 'Invalid or expired token' });
      }
    };
  },
});

export default JwtAuthMiddleware;
