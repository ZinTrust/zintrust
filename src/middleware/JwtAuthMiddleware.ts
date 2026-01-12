import { securityConfig } from '@config/security';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import type { Middleware } from '@middleware/MiddlewareStack';
import { TokenRevocation } from '@security/TokenRevocation';
import type { JwtAlgorithm} from '@security/JwtManager';
import { JwtManager, type IJwtManager } from '@security/JwtManager';

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

  const [scheme, token] = trimmed.split(' ');
  if (scheme !== 'Bearer') return null;
  if (typeof token !== 'string' || token.trim() === '') return null;
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

      if (TokenRevocation.isRevoked(token)) {
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
      } catch {
        res.setStatus(401).json({ error: 'Invalid or expired token' });
      }
    };
  },
});

export default JwtAuthMiddleware;
