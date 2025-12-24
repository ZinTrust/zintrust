import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import * as crypto from '@node-singletons/crypto';

// Middleware next function type
export type NextFunction = (error?: Error) => void | Promise<void>;

/**
 * Service-to-service authentication strategies
 */
export type AuthStrategy = 'api-key' | 'jwt' | 'none' | 'custom';

export interface AuthContext {
  isServiceCall: boolean;
  serviceName?: string;
  strategy: AuthStrategy;
  authenticated: boolean;
}

export interface IApiKeyAuth {
  verify(token: string): boolean;
  generate(): string;
}

/**
 * API Key Authentication
 */
export const ApiKeyAuth = Object.freeze({
  /**
   * Create a new API key auth instance
   */
  create(apiKey?: string): IApiKeyAuth {
    const generateSecureApiKeyDefault = (): string => {
      return crypto.randomBytes(32).toString('hex');
    };

    const getApiKey = (): string => {
      const envKey = Env.get('SERVICE_API_KEY');
      const secureDefault = generateSecureApiKeyDefault();
      if (envKey === undefined || envKey === secureDefault) {
        Logger.warn(
          '⚠️  WARNING: Using generated default API key. Set SERVICE_API_KEY environment variable in production!'
        );
        return secureDefault;
      }
      return envKey;
    };

    const key = apiKey ?? getApiKey();

    return {
      verify(token: string): boolean {
        return token === key;
      },

      generate(): string {
        return crypto.randomBytes(32).toString('hex');
      },
    };
  },
});

export interface IJwtAuth {
  sign(payload: Record<string, unknown>, expiresIn?: string): string;
  verify(token: string): Record<string, unknown> | null;
}

/**
 * JWT Authentication
 */
export const JwtAuth = Object.freeze({
  /**
   * Create a new JWT auth instance
   */
  create(secret?: string): IJwtAuth {
    const generateSecureJwtDefault = (): string => {
      return crypto.randomBytes(32).toString('hex');
    };

    const getJwtSecret = (): string => {
      const envSecret = Env.get('SERVICE_JWT_SECRET');
      const secureDefault = generateSecureJwtDefault();
      if (envSecret === undefined || envSecret === secureDefault) {
        Logger.warn(
          '⚠️  WARNING: Using generated default JWT secret. Set SERVICE_JWT_SECRET environment variable in production!'
        );
        return secureDefault;
      }
      return envSecret;
    };

    const jwtSecret = secret ?? getJwtSecret();

    return {
      sign(payload: Record<string, unknown>, _expiresIn: string = '1h'): string {
        // Simplified JWT (in production, use jsonwebtoken library)
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
        const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString(
          'base64'
        );

        const signature = crypto
          .createHmac('sha256', jwtSecret)
          .update(`${header}.${body}`)
          .digest('base64');

        return `${header}.${body}.${signature}`;
      },

      verify(token: string): Record<string, unknown> | null {
        try {
          const parts = token.split('.');
          if (parts.length !== 3) return null;
          const [header, body, signature] = parts;
          const expectedSignature = crypto
            .createHmac('sha256', jwtSecret)
            .update(`${header}.${body}`)
            .digest('base64');

          if (signature !== expectedSignature) {
            return null;
          }

          return JSON.parse(Buffer.from(body, 'base64').toString()) as Record<string, unknown>;
        } catch (error) {
          Logger.error('JWT verification failed', error);
          return null;
        }
      },
    };
  },
});

export interface ICustomAuth {
  verify(token: string): boolean;
}

/**
 * Custom Authentication (developer-defined)
 */
export const CustomAuth = Object.freeze({
  /**
   * Create a new custom auth instance
   */
  create(validator: (token: string) => boolean): ICustomAuth {
    return {
      verify(token: string): boolean {
        return validator(token);
      },
    };
  },
});

export interface IServiceAuthMiddleware {
  registerCustomAuth(validator: (token: string) => boolean): void;
  middleware(
    strategy: AuthStrategy
  ): (req: IRequest, res: IResponse, next: NextFunction) => void | Promise<void>;
}

/**
 * Service-to-Service Authentication Middleware
 */
type AuthHeader = { scheme: string; token: string };

interface VerifyResult {
  authenticated: boolean;
  status?: number;
  error?: string;
}

/**
 * Create initial authentication context
 */
const createAuthContext = (strategy: AuthStrategy): AuthContext => {
  return {
    isServiceCall: false,
    strategy,
    authenticated: strategy === 'none',
  };
};

/**
 * Attach context to request and proceed to next middleware
 */
const attachContextAndNext = (
  req: IRequest,
  context: AuthContext,
  next: NextFunction
): void | Promise<void> => {
  req.context ??= {};
  req.context['serviceAuth'] = context;
  return next();
};

/**
 * Finalize successful service authentication
 */
const finalizeServiceAuth = (
  req: IRequest,
  context: AuthContext,
  next: NextFunction
): void | Promise<void> => {
  context.authenticated = true;
  context.isServiceCall = true;
  return attachContextAndNext(req, context, next);
};

/**
 * Parse authorization header
 */
const parseAuthHeader = (req: IRequest): AuthHeader | null => {
  const authHeader = req.getHeader('authorization');
  if (authHeader === undefined || typeof authHeader !== 'string') {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return null;
  }

  const scheme = parts[0];
  const token = parts[1];

  if (!scheme || !token) {
    return null;
  }

  return { scheme, token };
};

/**
 * Verify API Key strategy
 */
const verifyApiKeyStrategy = (
  apiKeyAuth: IApiKeyAuth,
  scheme: string,
  token: string
): VerifyResult => {
  if (scheme !== 'Bearer' || apiKeyAuth.verify(token) === false) {
    return { authenticated: false, status: 403, error: 'Invalid API key' };
  }
  return { authenticated: true };
};

/**
 * Verify JWT strategy
 */
const verifyJwtStrategy = (
  jwtAuth: IJwtAuth,
  scheme: string,
  token: string,
  context: AuthContext
): VerifyResult => {
  if (scheme !== 'Bearer') {
    return {
      authenticated: false,
      status: 401,
      error: 'Invalid authorization scheme',
    };
  }

  const payload = jwtAuth.verify(token);
  if (payload === null) {
    return { authenticated: false, status: 403, error: 'Invalid JWT token' };
  }

  const serviceName = payload['serviceName'];
  context.serviceName = typeof serviceName === 'string' ? serviceName : '';
  return { authenticated: true };
};

/**
 * Verify Custom strategy
 */
const verifyCustomStrategy = (
  customValidator: ((token: string) => boolean) | null,
  token: string
): VerifyResult => {
  if (customValidator === null || customValidator(token) === false) {
    return { authenticated: false, status: 403, error: 'Authentication failed' };
  }
  return { authenticated: true };
};

/**
 * Verify authentication strategy
 */
const verifyStrategy = (
  strategy: AuthStrategy,
  auth: AuthHeader,
  context: AuthContext,
  deps: {
    apiKeyAuth: IApiKeyAuth;
    jwtAuth: IJwtAuth;
    customValidator: ((token: string) => boolean) | null;
  }
): VerifyResult => {
  switch (strategy) {
    case 'api-key':
      return verifyApiKeyStrategy(deps.apiKeyAuth, auth.scheme, auth.token);
    case 'jwt':
      return verifyJwtStrategy(deps.jwtAuth, auth.scheme, auth.token, context);
    case 'custom':
      return verifyCustomStrategy(deps.customValidator, auth.token);
    default:
      return { authenticated: false, status: 401, error: 'Unsupported strategy' };
  }
};

const createServiceAuthMiddleware = (): IServiceAuthMiddleware => {
  const defaultApiKeyAuth = ApiKeyAuth.create();
  const defaultJwtAuth = JwtAuth.create();
  let customValidator: ((token: string) => boolean) | null = null;

  return {
    /**
     * Register custom auth validator
     */
    registerCustomAuth(validator: (token: string) => boolean): void {
      customValidator = validator;
    },

    /**
     * Middleware to authenticate service-to-service calls
     */
    middleware(
      strategy: AuthStrategy
    ): (req: IRequest, res: IResponse, next: NextFunction) => void | Promise<void> {
      return async (req: IRequest, res: IResponse, next: NextFunction) => {
        const context = createAuthContext(strategy);

        if (strategy === 'none') {
          return attachContextAndNext(req, context, next);
        }

        const auth = parseAuthHeader(req);
        if (auth === null) {
          return res.setStatus(401).json({ error: 'Missing or invalid authorization header' });
        }

        const result = verifyStrategy(strategy, auth, context, {
          apiKeyAuth: defaultApiKeyAuth,
          jwtAuth: defaultJwtAuth,
          customValidator,
        });

        if (!result.authenticated) {
          return res.setStatus(result.status ?? 401).json({ error: result.error });
        }

        return finalizeServiceAuth(req, context, next);
      };
    },
  };
};

export const ServiceAuthMiddleware = Object.freeze(createServiceAuthMiddleware());

export default ServiceAuthMiddleware;
