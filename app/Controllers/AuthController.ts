/**
 * Auth Controller
 * Minimal, real auth endpoints backing the example API routes.
 */

import {
  AuthControllerApi,
  JsonRecord,
  LoginBody,
  RegisterBody,
  UserRow,
} from '@app/Types/controller';
import { getString } from '@common/utility';
import { Logger } from '@config/logger';
import { Auth } from '@features/Auth';
import type { ValidatedRequest } from '@http/Request';
import { useEnsureDbConnected } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { JwtManager } from '@security/JwtManager';
import { Sanitizer } from '@security/Sanitizer';

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
    const validated = (typedReq as unknown as { validated?: { body?: unknown } }).validated;
    const rawBody = (validated?.body ?? typedReq.body ?? {}) as JsonRecord;

    const email = Sanitizer.email(rawBody['email']).trim().toLowerCase();
    const password = Sanitizer.safePasswordChars(getString(rawBody['password']));

    try {
      const db = await useEnsureDbConnected();

      const existing = await QueryBuilder.create('users', db)
        .where('email', '=', email)
        .limit(1)
        .first<UserRow>();

      if (existing === null) {
        Logger.warn('AuthController.login invalid credentials');
        res.setStatus(401).json({ error: 'Invalid credentials' });
        return;
      }

      const passwordHash = getString(existing.password);
      const ok = await Auth.compare(password, passwordHash);
      if (!ok) {
        Logger.warn('AuthController.login invalid credentials');
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
    const validated = (typedReq as unknown as { validated?: { body?: unknown } }).validated;
    const rawBody = (validated?.body ?? typedReq.body ?? {}) as JsonRecord;

    const name = Sanitizer.nameText(rawBody['name']).trim();
    const email = Sanitizer.email(rawBody['email']).trim().toLowerCase();
    const password = Sanitizer.safePasswordChars(getString(rawBody['password']));

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
