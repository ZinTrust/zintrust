/**
 * Auth Controller
 * Minimal, real auth endpoints backing the example API routes.
 */

import {
  getString,
  Auth,
  Logger,
  getValidatedBody,
  useEnsureDbConnected,
  QueryBuilder,
  JwtManager,
  TokenRevocation
} from '@zintrust/core';
import type { AuthControllerApi, JsonRecord, UserRow } from '@app/Types/controller';
import type { IRequest, IResponse } from '@zintrust/core';


const pickPublicUser = (row: UserRow): { id: unknown; name: string; email: string } => {
  return {
    id: row.id,
    name: getString(row.name),
    email: getString(row.email),
  };
};

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

  try {
    const db = await useEnsureDbConnected();

    const existing = await QueryBuilder.create('users', db)
      .where('email', '=', email)
      .limit(1)
      .first<UserRow>();

    if (existing === null) {
      Logger.warn('AuthController.login: failed login attempt', {
        email,
        ip: ipAddress,
        reason: 'user_not_found',
        timestamp: new Date().toISOString(),
      });
      res.setStatus(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordHash = getString(existing.password);
    const ok = await Auth.compare(password, passwordHash);
    if (!ok) {
      Logger.warn('AuthController.login: failed login attempt', {
        email,
        ip: ipAddress,
        reason: 'invalid_password',
        timestamp: new Date().toISOString(),
      });
      res.setStatus(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = pickPublicUser(existing);

    const subject = ((): string | undefined => {
      const id = user.id;
      if (typeof id === 'string' && id.length > 0) return id;
      if (typeof id === 'number' && Number.isFinite(id)) return String(id);
      return undefined;
    })();

    const token = JwtManager.signAccessToken({
      sub: subject,
      email,
    });

    Logger.info('AuthController.login: successful login', {
      userId: subject,
      email,
      ip: ipAddress,
      timestamp: new Date().toISOString(),
    });

    res.json({
      token,
      token_type: 'Bearer',
      user,
    });
  } catch (error) {
    Logger.error('AuthController.login: unexpected error', {
      email,
      ip: ipAddress,
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
    const db = await useEnsureDbConnected();

    const existing = await QueryBuilder.create('users', db)
      .where('email', '=', email)
      .limit(1)
      .first<UserRow>();

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

    await QueryBuilder.create('users', db).insert({
      name,
      email,
      password: passwordHash,
    });

    Logger.info('AuthController.register: successful registration', {
      email,
      ip: ipAddress,
      timestamp: new Date().toISOString(),
    });

    res.setStatus(201).json({ message: 'Registered' });
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
  TokenRevocation.revoke(authHeader);
  res.json({ message: 'Logged out' });
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

  const token = JwtManager.signAccessToken(user);
  res.json({ token, token_type: 'Bearer' });
}

export const AuthController = Object.freeze({
  create(): AuthControllerApi {
    return {
      login,
      register,
      logout,
      refresh,
    };
  },
});

export default AuthController;
