/**
 * Auth Controller
 * Minimal, real auth endpoints backing the example API routes.
 */

import { AuthControllerApi, JsonRecord, UserRow } from '@app/Types/controller';
import { getString } from '@common/utility';
import { Logger } from '@config/logger';
import { Auth } from '@features/Auth';
import { getValidatedBody } from '@http/ValidationHelper';
import { useEnsureDbConnected } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { JwtManager } from '@security/JwtManager';

const pickPublicUser = (row: UserRow): { id: unknown; name: string; email: string } => {
  return {
    id: row.id,
    name: getString(row.name),
    email: getString(row.email),
  };
};

const controller: AuthControllerApi = {
  async login(req, res): Promise<void> {
    const body = getValidatedBody<JsonRecord>(req);
    if (!body) {
      Logger.error(
        'AuthController.login: validation middleware did not populate req.validated.body'
      );
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
  },

  async register(req, res): Promise<void> {
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
  },

  async logout(_req, res): Promise<void> {
    // JWT is stateless by default; logout is a client-side concern unless
    // you implement token revocation/blacklists.
    res.json({ message: 'Logged out' });
  },

  async refresh(req, res): Promise<void> {
    const user = req.user;
    if (user === undefined) {
      res.setStatus(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = JwtManager.signAccessToken(user);
    res.json({ token, token_type: 'Bearer' });
  },
};

export const AuthController = Object.freeze({
  create(): AuthControllerApi {
    return controller;
  },
});

export default AuthController;
