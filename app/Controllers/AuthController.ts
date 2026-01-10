/**
 * Auth Controller
 * Minimal, real auth endpoints backing the example API routes.
 */

import { getString } from '@common/utility';
import { Logger } from '@config/logger';
import { Auth } from '@features/Auth';
import type { IRequest, ValidatedRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { useEnsureDbConnected } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { JwtManager } from '@security/JwtManager';

type JsonRecord = Record<string, unknown>;

type LoginBody = {
  email: string;
  password: string;
};

type RegisterBody = {
  name: string;
  email: string;
  password: string;
};

type UserRow = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  password?: unknown;
};
export type AuthControllerApi = {
  login(req: IRequest, res: IResponse): Promise<void>;
  register(req: IRequest, res: IResponse): Promise<void>;
  logout(req: IRequest, res: IResponse): Promise<void>;
  refresh(req: IRequest, res: IResponse): Promise<void>;
};

const pickPublicUser = (row: UserRow): { id: unknown; name: string; email: string } => {
  return {
    id: row.id,
    name: getString(row.name),
    email: getString(row.email),
  };
};

const controller: AuthControllerApi = {
  async login(req, res): Promise<void> {
    const typedReq = req as ValidatedRequest<LoginBody>;
    const maybeValidated = (typedReq as unknown as { validated?: { body?: unknown } }).validated;
    const body = ((maybeValidated?.body ?? typedReq.body ?? {}) as JsonRecord) ?? {};
    const email = getString(body['email']).trim().toLowerCase();
    const password = getString(body['password']);

    try {
      const db = await useEnsureDbConnected();

      const existing = await QueryBuilder.create('users', db)
        .where('email', '=', email)
        .limit(1)
        .first<UserRow>();

      if (existing === null) {
        res.setStatus(401).json({ error: 'Invalid credentials' });
        return;
      }

      const passwordHash = getString(existing.password);
      const ok = await Auth.compare(password, passwordHash);
      if (!ok) {
        res.setStatus(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = pickPublicUser(existing);
      const token = JwtManager.signAccessToken({
        sub: typeof user.id === 'string' ? user.id : undefined,
        email,
      });

      res.json({
        token,
        token_type: 'Bearer',
        user,
      });
    } catch (error) {
      Logger.error('AuthController.login failed', error);
      res.setStatus(500).json({ error: 'Login failed' });
    }
  },

  async register(req, res): Promise<void> {
    const typedReq = req as ValidatedRequest<RegisterBody>;
    const maybeValidated = (typedReq as unknown as { validated?: { body?: unknown } }).validated;
    const body = ((maybeValidated?.body ?? typedReq.body ?? {}) as JsonRecord) ?? {};
    const name = getString(body['name']).trim();
    const email = getString(body['email']).trim().toLowerCase();
    const password = getString(body['password']);

    try {
      const db = await useEnsureDbConnected();

      const existing = await QueryBuilder.create('users', db)
        .where('email', '=', email)
        .limit(1)
        .first<UserRow>();

      if (existing !== null) {
        res.setStatus(409).json({ error: 'Email already registered' });
        return;
      }

      const passwordHash = await Auth.hash(password);

      await QueryBuilder.create('users', db).insert({
        name,
        email,
        password: passwordHash,
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
