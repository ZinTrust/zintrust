import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { Request } from '@http/Request';
import { Response } from '@http/Response';
import crypto from 'node:crypto';

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

/**
 * API Key Authentication
 */

function getApiKey(): string {
  const envKey = Env.SERVICE_API_KEY;
  const secureDefault = generateSecureApiKeyDefault();
  if (envKey === undefined || envKey === secureDefault) {
    Logger.warn(
      '⚠️  WARNING: Using generated default API key. Set SERVICE_API_KEY environment variable in production!'
    );
    return secureDefault;
  }
  return envKey;
}

function generateSecureApiKeyDefault(): string {
  return crypto.randomBytes(32).toString('hex');
}

export class ApiKeyAuth {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? getApiKey();
  }

  public verify(token: string): boolean {
    return token === this.apiKey;
  }

  public generate(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

/**
 * JWT Authentication
 */

function getJwtSecret(): string {
  const envSecret = Env.SERVICE_JWT_SECRET;
  const secureDefault = generateSecureJwtDefault();
  if (envSecret === undefined || envSecret === secureDefault) {
    Logger.warn(
      '⚠️  WARNING: Using generated default JWT secret. Set SERVICE_JWT_SECRET environment variable in production!'
    );
    return secureDefault;
  }
  return envSecret;
}

function generateSecureJwtDefault(): string {
  return crypto.randomBytes(32).toString('hex');
}

export class JwtAuth {
  private readonly secret: string;

  constructor(secret?: string) {
    this.secret = secret ?? getJwtSecret();
  }

  public sign(payload: Record<string, unknown>, _expiresIn: string = '1h'): string {
    // Simplified JWT (in production, use jsonwebtoken library)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64');

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64');

    return `${header}.${body}.${signature}`;
  }

  public verify(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [header, body, signature] = parts;
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(`${header}.${body}`)
        .digest('base64');

      if (signature !== expectedSignature) {
        return null;
      }

      return JSON.parse(Buffer.from(body, 'base64').toString()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/**
 * Custom Authentication (developer-defined)
 */
export class CustomAuth {
  private readonly validator: (token: string) => boolean;

  constructor(validator: (token: string) => boolean) {
    this.validator = validator;
  }

  verify(token: string): boolean {
    return this.validator(token);
  }
}

/**
 * Service-to-Service Authentication Middleware
 */

const defaultApiKeyAuth = new ApiKeyAuth();
const defaultJwtAuth = new JwtAuth();
let customValidator: ((token: string) => boolean) | null = null;

/**
 * Register custom auth validator
 */
export function registerCustomAuth(validator: (token: string) => boolean): void {
  customValidator = validator;
}

/**
 * Middleware to authenticate service-to-service calls
 */
export function middleware(
  strategy: AuthStrategy
): (req: Request, res: Response, next: NextFunction) => void | Promise<void> {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = createAuthContext(strategy);

    if (strategy === 'none') {
      return attachContextAndNext(req, context, next);
    }

    const auth = parseAuthHeader(req);
    if (!auth) {
      return res.setStatus(401).json({ error: 'Missing or invalid authorization header' });
    }

    const result = verifyStrategy(strategy, auth.scheme, auth.token, context);
    if (!result.authenticated) {
      return res.setStatus(result.status ?? 401).json({ error: result.error });
    }

    return finalizeServiceAuth(req, context, next);
  };
}

/**
 * Create initial authentication context
 */
function createAuthContext(strategy: AuthStrategy): AuthContext {
  return {
    isServiceCall: false,
    strategy,
    authenticated: strategy === 'none',
  };
}

/**
 * Attach context to request and proceed to next middleware
 */
function attachContextAndNext(
  req: Request,
  context: AuthContext,
  next: NextFunction
): void | Promise<void> {
  req.context ??= {};
  req.context['serviceAuth'] = context;
  return next();
}

/**
 * Finalize successful service authentication
 */
function finalizeServiceAuth(
  req: Request,
  context: AuthContext,
  next: NextFunction
): void | Promise<void> {
  context.authenticated = true;
  context.isServiceCall = true;
  return attachContextAndNext(req, context, next);
}

/**
 * Parse authorization header
 */
function parseAuthHeader(req: Request): { scheme: string; token: string } | null {
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
}

/**
 * Verify authentication strategy
 */
function verifyStrategy(
  strategy: string,
  scheme: string,
  token: string,
  context: AuthContext
): { authenticated: boolean; status?: number; error?: string } {
  switch (strategy) {
    case 'api-key':
      return verifyApiKeyStrategy(scheme, token);
    case 'jwt':
      return verifyJwtStrategy(scheme, token, context);
    case 'custom':
      return verifyCustomStrategy(token);
    default:
      return { authenticated: false, status: 401, error: 'Unsupported strategy' };
  }
}

/**
 * Verify API Key strategy
 */
function verifyApiKeyStrategy(
  scheme: string,
  token: string
): { authenticated: boolean; status?: number; error?: string } {
  if (scheme !== 'Bearer' || defaultApiKeyAuth.verify(token) === false) {
    return { authenticated: false, status: 403, error: 'Invalid API key' };
  }
  return { authenticated: true };
}

/**
 * Verify JWT strategy
 */
function verifyJwtStrategy(
  scheme: string,
  token: string,
  context: AuthContext
): { authenticated: boolean; status?: number; error?: string } {
  if (scheme !== 'Bearer') {
    return { authenticated: false, status: 401, error: 'Invalid authorization scheme' };
  }

  const payload = defaultJwtAuth.verify(token);
  if (payload === null) {
    return { authenticated: false, status: 403, error: 'Invalid JWT token' };
  }

  const serviceName = payload['serviceName'];
  context.serviceName = typeof serviceName === 'string' ? serviceName : '';
  return { authenticated: true };
}

/**
 * Verify Custom strategy
 */
function verifyCustomStrategy(token: string): {
  authenticated: boolean;
  status?: number;
  error?: string;
} {
  if (customValidator === null || customValidator(token) === false) {
    return { authenticated: false, status: 403, error: 'Authentication failed' };
  }
  return { authenticated: true };
}

export const ServiceAuthMiddleware = {
  middleware,
  registerCustomAuth,
};

export default ServiceAuthMiddleware;
