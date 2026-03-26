import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import type { IRequest } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import type { DefaultMiddlewareFailureBody } from '@middleware/MiddlewareFailureBody';
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

const createJwtFailureBody = (reason: string, message: string): DefaultMiddlewareFailureBody => ({
  error: {
    code: reason,
    message,
  },
});

const respondJwtUnauthorized = async (
  req: IRequest,
  res: IResponse,
  onUnauthorized: MiddlewareFailureResponder | undefined,
  reason: string,
  message: string,
  error?: unknown
): Promise<void> => {
  await respondWithMiddlewareFailure(req, res, onUnauthorized, {
    middleware: 'jwt',
    reason,
    statusCode: 401,
    message,
    body: createJwtFailureBody(reason, message),
    error,
  });
};

const hydrateJwtRequestContext = (req: IRequest, payload: Record<string, unknown>): void => {
  req.user = payload;

  const subject = payload['sub'];
  if (typeof subject === 'string' && subject.trim() !== '') {
    RequestContext.setUserId(req, subject);
  }

  const tenantId =
    getOptionalStringOrNumberClaim(payload, 'tenantId') ??
    getOptionalStringOrNumberClaim(payload, 'tenant_id');
  if (tenantId !== undefined && tenantId.trim() !== '') {
    RequestContext.setTenantId(req, tenantId);
  }
};

const createJwtMiddlewareHandler = (
  jwt: IJwtManager,
  algorithm: JwtAlgorithm,
  onUnauthorized: MiddlewareFailureResponder | undefined
): Middleware => {
  return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
    if (req.context?.['authStrategy'] === 'bulletproof' && req.user !== undefined) {
      await next();
      return;
    }

    const authorizationHeader = getHeaderValue(req.getHeader('authorization'));
    if (authorizationHeader === '') {
      await respondJwtUnauthorized(
        req,
        res,
        onUnauthorized,
        'missing_authorization_header',
        'Missing authorization header'
      );
      return;
    }

    const token = getBearerToken(authorizationHeader);
    if (token === null) {
      await respondJwtUnauthorized(
        req,
        res,
        onUnauthorized,
        'invalid_authorization_header_format',
        'Invalid authorization header format'
      );
      return;
    }

    try {
      const payload = jwt.verify(token, algorithm);

      if (!(await JwtSessions.isActive(token))) {
        await respondJwtUnauthorized(
          req,
          res,
          onUnauthorized,
          'inactive_session',
          'Invalid or expired token'
        );
        return;
      }

      hydrateJwtRequestContext(req, payload as Record<string, unknown>);
      await next();
    } catch (error) {
      Logger.debug('JWT verification failed', {
        algorithm,
        error: error instanceof Error ? error.message : String(error),
      });

      await respondJwtUnauthorized(
        req,
        res,
        onUnauthorized,
        getJwtFailureReason(error),
        'Invalid or expired token',
        error
      );
    }
  };
};

export const JwtAuthMiddleware = Object.freeze({
  create(options: JwtAuthOptions = {}): Middleware {
    const algorithm = options.algorithm ?? securityConfig.jwt.algorithm;
    const secret = options.secret ?? securityConfig.jwt.secret;

    const jwt: IJwtManager = JwtManager.create();
    if (algorithm === 'HS256' || algorithm === 'HS512') {
      jwt.setHmacSecret(secret);
    }

    return createJwtMiddlewareHandler(jwt, algorithm, options.onUnauthorized);
  },
});

export default JwtAuthMiddleware;
