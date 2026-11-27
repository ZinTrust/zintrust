import { Logger } from '@config/logger';
import { securityConfig } from '@config/security';
import type { IRequest } from '@http/Request';
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

const createAuthFailureBody = (reason: string, message: string): DefaultMiddlewareFailureBody => ({
  error: {
    code: reason,
    message,
  },
});

export interface AuthOptions {
  headerName?: string;
  message?: string;
  onUnauthorized?: MiddlewareFailureResponder;
  algorithm?: JwtAlgorithm;
  secret?: string;

  /**
   * Verify the bearer token as a framework JWT (signature + active session).
   * Defaults to true. Set to false ONLY when a different auth scheme is enforced
   * by another middleware (e.g. an API-key verifier).
   */
  verify?: boolean;
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
  return token === '' ? null : token;
};

export const AuthMiddleware = Object.freeze({
  /**
   * Authentication middleware.
   *
   * By default this verifies the Bearer token using the framework JWT manager and confirms
   * the session is active. When `verify: false` it ONLY asserts that a syntactically valid
   * Bearer header is present — it does NOT authenticate the caller. Presence-only mode must
   * be paired with a verifying middleware such as `jwt` or `bulletproof`.
   */
  create(options: AuthOptions = {}): Middleware {
    const headerName = (options.headerName ?? 'authorization').toLowerCase();
    const message = options.message ?? 'Unauthorized';
    const algorithm = options.algorithm ?? securityConfig.jwt.algorithm;
    const secret = options.secret ?? securityConfig.jwt.secret;
    const shouldVerify = options.verify ?? true;

    const jwt: IJwtManager = JwtManager.create();
    if (algorithm === 'HS256' || algorithm === 'HS512') {
      jwt.setHmacSecret(secret);
    }

    const unauthorized = async (
      req: IRequest,
      res: IResponse,
      reason: string,
      failureMessage: string
    ): Promise<void> => {
      await respondWithMiddlewareFailure(req, res, options.onUnauthorized, {
        middleware: 'auth',
        reason,
        statusCode: 401,
        message: failureMessage,
        body: createAuthFailureBody(reason, failureMessage),
      });
    };

    return async (req: IRequest, res: IResponse, next: () => Promise<void>): Promise<void> => {
      const header = getHeaderValue(req.getHeader(headerName));

      if (header.trim() === '') {
        await unauthorized(req, res, 'missing_authorization_header', message);
        return;
      }

      const token = getBearerToken(header);
      if (token === null) {
        await unauthorized(req, res, 'invalid_authorization_header_format', message);
        return;
      }

      if (shouldVerify) {
        try {
          jwt.verify(token, algorithm);
        } catch (error) {
          Logger.debug('AuthMiddleware JWT verification failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          await unauthorized(req, res, 'invalid_token', message);
          return;
        }

        if (!(await JwtSessions.isActive(token))) {
          await unauthorized(req, res, 'inactive_session', message);
          return;
        }
      }

      await next();
    };
  },
});

export default AuthMiddleware;
