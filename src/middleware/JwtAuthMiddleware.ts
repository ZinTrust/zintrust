import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import {
  respondWithMiddlewareFailure,
  type MiddlewareFailureResponder,
} from '@middleware/MiddlewareFailureResponder';
import type { Middleware } from '@middleware/MiddlewareStack';
import type { IJwtManager, JwtAlgorithm } from '@security/JwtManager';
import { JwtManager } from '@security/JwtManager';
import { JwtSessions } from '@security/JwtSessions';

export interface JwtAuthOptions {
  algorithm?: JwtAlgorithm;
  secret?: string;
  onUnauthorized?: MiddlewareFailureResponder;
}

const getJwtFailureReason = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return 'invalid_token';

  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name === 'TokenExpiredError' || candidate.code === 'TOKEN_EXPIRED') {
    return 'expired_token';
  }

  return 'invalid_token';
};

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
      // If a stronger auth strategy already authenticated this request, do not re-verify.
      if (req.context?.['authStrategy'] === 'bulletproof' && req.user !== undefined) {
        await next();
        return;
      }

      const authorizationHeader = getHeaderValue(req.getHeader('authorization'));
      if (authorizationHeader === '') {
        await respondWithMiddlewareFailure(req, res, options.onUnauthorized, {
          middleware: 'jwt',
          reason: 'missing_authorization_header',
          statusCode: 401,
          message: 'Missing authorization header',
          body: { error: 'Missing authorization header' },
        });
        return;
      }

      const token = getBearerToken(authorizationHeader);
      if (token === null) {
        await respondWithMiddlewareFailure(req, res, options.onUnauthorized, {
          middleware: 'jwt',
          reason: 'invalid_authorization_header_format',
          statusCode: 401,
          message: 'Invalid authorization header format',
          body: { error: 'Invalid authorization header format' },
        });
        return;
      }

      try {
        const payload = jwt.verify(token, algorithm);

        // Session allowlist: token must exist in the session store to be accepted.
        if (!(await JwtSessions.isActive(token))) {
          await respondWithMiddlewareFailure(req, res, options.onUnauthorized, {
            middleware: 'jwt',
            reason: 'inactive_session',
            statusCode: 401,
            message: 'Invalid or expired token',
            body: { error: 'Invalid or expired token' },
          });
          return;
        }

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
        await respondWithMiddlewareFailure(req, res, options.onUnauthorized, {
          middleware: 'jwt',
          reason: getJwtFailureReason(error),
          statusCode: 401,
          message: 'Invalid or expired token',
          body: { error: 'Invalid or expired token' },
          error,
        });
      }
    };
  },
});

export default JwtAuthMiddleware;
