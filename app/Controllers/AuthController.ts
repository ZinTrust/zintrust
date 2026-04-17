/**
 * Auth Controller
 * Minimal, real auth endpoints backing the example API routes.
 */

import { Auth } from '@/auth/Auth';
import { LoginFlow } from '@/auth/LoginFlow';
import type { LoginFlowProvider } from '@/auth/LoginFlow';
import { isUndefinedOrNull } from '@/helper';
import { User } from '@app/Models/User';
import type { AuthControllerApi, JsonRecord, UserRow } from '@app/Types/controller';
import { getString } from '@common/utility';
import DefaultLogger, { Logger as NamedLogger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { getValidatedBody } from '@http/ValidationHelper';
import { JwtManager } from '@security/JwtManager';

const noopLoggerMethod = (_message: string, _data?: unknown): void => undefined;

const Logger =
  NamedLogger ??
  DefaultLogger ??
  Object.freeze({
    debug: noopLoggerMethod,
    info: noopLoggerMethod,
    warn: noopLoggerMethod,
    error: noopLoggerMethod,
    fatal: noopLoggerMethod,
  });

const pickPublicUser = (row: UserRow): { id: unknown; name: string; email: string } => {
  return {
    id: row.id,
    name: getString(row.name),
    email: getString(row.email),
  };
};

type PasswordLoginContext = {
  email: string;
  ipAddress: string;
  requestId?: string;
};

const toSubject = (id: unknown): string | undefined => {
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return undefined;
};

const toDeviceId = (subject: string | undefined): string | undefined => {
  return isUndefinedOrNull(subject) ? undefined : `dev-${subject}`;
};

const getClaimString = (claims: unknown, key: string): string | undefined => {
  if (typeof claims !== 'object' || claims === null) {
    return undefined;
  }

  const value = (claims as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
};

const getIssuedToken = (issued: unknown): string => {
  if (typeof issued === 'string' && issued.trim() !== '') {
    return issued;
  }

  throw ErrorFactory.createSecurityError('LoginFlow jwt issuer returned an invalid access token');
};

const isLoginFlowUnauthorizedFailure = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const details = (error as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) {
    return false;
  }

  const nested = (details as Record<string, unknown>)['error'];
  return (
    typeof nested === 'object' &&
    nested !== null &&
    (nested as { statusCode?: unknown }).statusCode === 401
  );
};

const passwordLoginProvider = Object.freeze({
  async identify(input: { email: string }, context: PasswordLoginContext): Promise<UserRow | null> {
    const existing = await User.where('email', '=', input.email).first<UserRow>();

    if (existing === null) {
      Logger.warn('AuthController.login: failed login attempt', {
        email: context.email,
        ip: context.ipAddress,
        reason: 'user_not_found',
        ...(isUndefinedOrNull(context.requestId) ? {} : { requestId: context.requestId }),
        timestamp: new Date().toISOString(),
      });
    }

    return existing;
  },

  async verify(
    identity: UserRow | null,
    input: { password: string },
    context: PasswordLoginContext
  ) {
    if (identity === null) {
      throw ErrorFactory.createUnauthorizedError('Invalid credentials');
    }

    const passwordHash = getString(identity.password);
    const ok = await Auth.compare(input.password, passwordHash);
    if (!ok) {
      Logger.warn('AuthController.login: failed login attempt', {
        email: context.email,
        ip: context.ipAddress,
        reason: 'invalid_password',
        ...(isUndefinedOrNull(context.requestId) ? {} : { requestId: context.requestId }),
        timestamp: new Date().toISOString(),
      });
      throw ErrorFactory.createUnauthorizedError('Invalid credentials');
    }

    const user = pickPublicUser(identity);
    const subject = toSubject(user.id);
    const deviceId = toDeviceId(subject);

    return {
      user,
      subject,
      claims: {
        sub: subject,
        email: user.email,
        ...(isUndefinedOrNull(deviceId) ? {} : { deviceId }),
      },
    };
  },
}) as LoginFlowProvider<PasswordLoginContext>;

/**
 * Authenticates a user by email and password.
 * Validates credentials against the database and returns a JWT access token on success.
 * Logs all authentication attempts for security auditing.
 * @param req - HTTP request containing email and password
 * @param res - HTTP response to send authentication result
 * @returns Promise that resolves after sending the response
 */
async function login(req: IRequest, res: IResponse): Promise<void> {
  const body = getValidatedBody<JsonRecord>(req);
  if (!body) {
    Logger.error('AuthController.login: validation middleware did not populate req.validated.body');
    return res.setStatus(500).json({ error: 'Internal server error' });
  }
  const email = getString(body['email']);
  const password = getString(body['password']);
  const ipAddress = req.getRaw().socket.remoteAddress ?? 'unknown';
  const requestIdHeader =
    typeof req.getHeader === 'function' ? req.getHeader('x-request-id') : undefined;
  const requestId =
    typeof requestIdHeader === 'string' && requestIdHeader.trim() !== ''
      ? requestIdHeader
      : undefined;

  try {
    const result = await LoginFlow.create({
      provider: passwordLoginProvider,
      context: Object.freeze({ email, ipAddress, requestId }),
    })
      .identify({ email })
      .verify({ password })
      .issue('jwt')
      .audit()
      .run();

    const user = result.verified.user as { id: unknown; name: string; email: string };
    const subject = getClaimString(result.verified.claims, 'sub');
    const deviceId = getClaimString(result.verified.claims, 'deviceId');
    const token = getIssuedToken(result.issued);

    Logger.info('AuthController.login: successful login', {
      userId: subject,
      email,
      ip: ipAddress,
      ...(isUndefinedOrNull(requestId) ? {} : { requestId }),
      timestamp: new Date().toISOString(),
    });

    res.json({
      token,
      token_type: 'Bearer',
      ...(isUndefinedOrNull(deviceId) ? {} : { deviceId }),
      user,
    });
  } catch (error) {
    if (isLoginFlowUnauthorizedFailure(error)) {
      res.setStatus(401).json({ error: 'Invalid credentials' });
      return;
    }

    Logger.error('AuthController.login: unexpected error', {
      email,
      ip: ipAddress,
      ...(isUndefinedOrNull(requestId) ? {} : { requestId }),
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    res.setStatus(500).json({ error: 'Login failed' });
  }
}

/**
 * Registers a new user with name, email, and password.
 * Validates email uniqueness, hashes password, and stores user in database.
 * Returns 201 on success, 409 if email already exists.
 * @param req - HTTP request containing name, email, and password
 * @param res - HTTP response to send registration result
 * @returns Promise that resolves after sending the response
 */
async function register(req: IRequest, res: IResponse): Promise<void> {
  const body = getValidatedBody<JsonRecord>(req);
  if (!body) {
    Logger.error(
      'AuthController.register: validation middleware did not populate req.validated.body'
    );
    res.setStatus(500).json({ error: 'Internal server error' });
    return;
  }
  const name = getString(body['name']);
  const email = getString(body['email']);
  const password = getString(body['password']);
  const ipAddress = req.getRaw().socket.remoteAddress ?? 'unknown';

  try {
    const existing = await User.where('email', '=', email).limit(1).first<UserRow>();

    if (existing !== null) {
      Logger.warn('AuthController.register: duplicate email attempt', {
        email,
        ip: ipAddress,
        timestamp: new Date().toISOString(),
      });
      res.setStatus(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await Auth.hash(password);

    const result = await User.query().insert({
      name,
      email,
      password: passwordHash,
    });

    let insertedUserId: unknown = result.id;
    if (insertedUserId === null || insertedUserId === undefined) {
      const inserted = await User.where('email', '=', email).limit(1).first<UserRow>();
      if (inserted?.id !== null && inserted?.id !== undefined) {
        insertedUserId = inserted.id;
      }
    }

    if (insertedUserId !== null && insertedUserId !== undefined) {
      Logger.info('AuthController.register: successful registration', {
        user_id: insertedUserId,
        email,
        ip: ipAddress,
        timestamp: new Date().toISOString(),
      });

      res.setStatus(201).json({ message: 'Registered' });
    } else {
      Logger.error('Failed to retrieve inserted user ID', {
        email,
        ip: ipAddress,
      });
      res.setStatus(500).json({ error: 'Registration failed' });
    }
    return;
  } catch (error) {
    Logger.error('AuthController.register failed', error);
    res.setStatus(500).json({ error: 'Registration failed' });
  }
}

/**
 * Logs out the current user by revoking their JWT token.
 * Extracts authorization header and marks token as revoked.
 * Requires persistent token revocation store for stateless JWT validation.
 * @param req - HTTP request containing authorization header with JWT token
 * @param res - HTTP response to send logout confirmation
 * @returns Promise that resolves after sending the response
 */
async function logout(req: IRequest, res: IResponse): Promise<void> {
  const authHeader =
    typeof req.getHeader === 'function' ? req.getHeader('authorization') : undefined;
  await JwtManager.logout(authHeader);
  res.json({ message: 'Logged out' });
}

/**
 * Logs out the current user from all devices by removing all active sessions for their subject.
 *
 * With session allowlist enforcement, deleting a user's session records causes any previously issued
 * tokens to become unauthorized (401) immediately.
 */
async function logoutAll(req: IRequest, res: IResponse): Promise<void> {
  const sub = typeof req.user?.sub === 'string' ? req.user.sub.trim() : '';
  if (sub === '') {
    res.setStatus(401).json({ error: 'Unauthorized' });
    return;
  }

  await JwtManager.logoutAll(sub);
  res.json({ message: 'Logged out everywhere' });
}

/**
 * Refreshes the user's JWT access token.
 * Generates a new token with the same claims as the current user.
 * Returns 401 if user is not authenticated.
 * @param req - HTTP request with user populated by authentication middleware
 * @param res - HTTP response to send refreshed token
 * @returns Promise that resolves after sending the response
 */
async function refresh(req: IRequest, res: IResponse): Promise<void> {
  const user = req.user;
  if (user === undefined) {
    res.setStatus(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = await JwtManager.signAccessToken(user);
  res.json({ token, token_type: 'Bearer' });
}

export const AuthController = Object.freeze({
  create(): AuthControllerApi {
    return {
      login,
      register,
      logout,
      logoutAll,
      refresh,
    };
  },
});

export default AuthController;
