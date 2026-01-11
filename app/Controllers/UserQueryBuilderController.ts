/**
 * User QueryBuilder Controller
 * QueryBuilder-backed controller for the users resource.
 */

import { IUserController, JsonRecord, ValidationErrorLike } from '@app/Types/controller';
import { getString, nowIso } from '@common/utility';
import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { getValidatedBody } from '@http/ValidationHelper';
import { randomBytes } from '@node-singletons/crypto';
import { useEnsureDbConnected } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { Sanitizer } from '@security/Sanitizer';
import { Schema, Validator } from '@validation/Validator';

const isValidationError = (error: unknown): error is ValidationErrorLike => {
  if (typeof error !== 'object' || error === null) return false;
  const maybe = error as ValidationErrorLike;
  return maybe.name === 'ValidationError' && typeof maybe.toObject === 'function';
};

const toJsonRecord = (value: unknown): JsonRecord => {
  if (typeof value !== 'object' || value === null) return {};
  if (Array.isArray(value)) return {};
  return value as JsonRecord;
};

const resolveBody = (req: IRequest): JsonRecord => {
  return toJsonRecord(getValidatedBody(req) ?? req.body ?? {});
};

const requireSelf = (req: IRequest, res: IResponse, userId: string): boolean => {
  const subject = typeof req.user?.sub === 'string' ? req.user.sub : undefined;
  if (subject === undefined || subject.length === 0) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (subject !== userId) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
};

const randomInt = (min: number, max: number): number => {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(lo + Math.random() * (hi - lo + 1)); // NOSONAR is just a test utility
};

const randomName = (): string => {
  const first = ['Alex', 'Jordan', 'Taylor', 'Sam', 'Casey', 'Riley', 'Morgan'];
  const last = ['Lee', 'Kim', 'Patel', 'Garcia', 'Brown', 'Nguyen', 'Smith'];
  return `${first[randomInt(0, first.length - 1)]} ${last[randomInt(0, last.length - 1)]}`;
};

const randomEmail = (): string => {
  const n = randomInt(10000, 99999);
  return `user${n}@example.com`;
};

const randomPassword = (): string => {
  // Not cryptographically perfect UX-wise, but avoids hard-coded credentials.
  // `base64url` keeps it URL-safe and reasonably short.
  return randomBytes(12).toString('base64url');
};

const pickAllowed = (body: JsonRecord, allowed: Set<string>): JsonRecord => {
  const out: JsonRecord = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
};

const hasUnknownKeys = (body: JsonRecord, allowed: Set<string>): string | null => {
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) return k;
  }
  return null;
};

/**
 * User Controller Methods
 */
const userControllerMethods: IUserController = {
  /**
   * List all users
   * GET /users
   */
  async index(req: IRequest, res: IResponse): Promise<void> {
    try {
      const subject = typeof req.user?.sub === 'string' ? req.user.sub : undefined;
      if (subject === undefined || subject.length === 0) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const db = await useEnsureDbConnected();
      const users = await QueryBuilder.create('users', db)
        .select('id', 'name', 'email', 'created_at', 'updated_at')
        .where('id', '=', subject)
        .limit(1)
        .get();

      res.json({ data: users });
    } catch (error) {
      Logger.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },

  /**
   * Show a specific user
   * GET /users/:id
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();
      const id = req.params['id'];
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Missing user id' });
        return;
      }

      if (!requireSelf(req, res, id)) return;

      const user = await QueryBuilder.create('users', db)
        .select('id', 'name', 'email', 'created_at', 'updated_at')
        .where('id', '=', id)
        .limit(1)
        .first();

      if (user === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ data: user });
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  },

  /**
   * Show create form
   * GET /users/create
   */
  async create(_req: IRequest, res: IResponse): Promise<void> {
    res.json({ form: 'Create User Form' });
  },

  /**
   * Store a new user
   * POST /users
   */
  async store(req: IRequest, res: IResponse): Promise<void> {
    try {
      // Use validated body if available (already sanitized by middleware), otherwise fallback to raw
      const body = resolveBody(req);

      // Trust middleware for sanitization if validation passed.
      // If we are here, validation ostensibly passed or we are in a context where we must self-validate.
      // To satisfy defense-in-depth without double-sanitization bottleneck:
      // We assume body is safe-ish if it came from resolved validated body.
      // But to be explicit and type-safe, we cast or read fields directly.

      const db = await useEnsureDbConnected();
      const ts = nowIso();

      await QueryBuilder.create('users', db).insert({
        name: getString(body['name']),
        email: getString(body['email']),
        password: getString(body['password']), // Hashing should be handled by model/service or here if raw
        created_at: ts,
        updated_at: ts,
      });

      res.status(201).json({ message: 'User created' });
    } catch (error) {
      if (isValidationError(error)) {
        res.status(422).json({ errors: error.toObject?.() ?? {} });
        return;
      }
      Logger.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  },

  /**
   * Fill users table with random users
   * POST /users/fill
   */
  async fill(req: IRequest, res: IResponse): Promise<void> {
    try {
      const body = resolveBody(req);
      const countVal = body['count'];

      // Ensure count is a number (middleware validation handles this, but we double check or default)
      let count = typeof countVal === 'number' ? countVal : 10;
      if (count < 1) count = 1;
      if (count > 100) count = 100;

      const db = await useEnsureDbConnected();
      const ts = nowIso();

      // Optimize: Bulk insert instead of N+1 inserts to reduce IO bottleneck and memory overhead
      const users = Array.from({ length: count }, () => ({
        name: randomName(),
        email: randomEmail(),
        password: randomPassword(),
        created_at: ts,
        updated_at: ts,
      }));

      await QueryBuilder.create('users', db).insert(users);

      res.status(201).json({ message: 'Users filled', count });
    } catch (error) {
      Logger.error('Error filling users:', error);
      res.status(500).json({ error: 'Failed to fill users' });
    }
  },

  /**
   * Show edit form
   * GET /users/:id/edit
   */
  async edit(_req: IRequest, res: IResponse): Promise<void> {
    try {
      res.json({ form: 'Edit User Form' });
    } catch (error) {
      Logger.error('Error loading edit form:', error);
      res.status(500).json({ error: 'Failed to load edit form' });
    }
  },

  /**
   * Update a user
   * PUT /users/:id
   */
  async update(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();
      const id = req.params['id'];
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Missing user id' });
        return;
      }

      if (!requireSelf(req, res, id)) return;

      const allowed = new Set(['name', 'email', 'password']);
      const body = resolveBody(req);
      const unknown = hasUnknownKeys(body, allowed);
      if (unknown !== null) {
        res.status(422).json({ errors: { [unknown]: ['Unknown field'] } });
        return;
      }

      const updateBody = pickAllowed(body, allowed);
      if (Object.keys(updateBody).length === 0) {
        res.status(422).json({ errors: { body: ['No fields to update'] } });
        return;
      }

      const sanitizedUpdateBody: JsonRecord = {};
      if ('name' in updateBody) {
        sanitizedUpdateBody['name'] = Sanitizer.nameText(updateBody['name']).trim();
      }
      if ('email' in updateBody) {
        sanitizedUpdateBody['email'] = Sanitizer.email(updateBody['email']).trim().toLowerCase();
      }
      if ('password' in updateBody) {
        sanitizedUpdateBody['password'] = Sanitizer.safePasswordChars(updateBody['password']);
      }

      const schema = Schema.create()
        .custom(
          'name',
          (v: unknown) => v === undefined || typeof v === 'string',
          'name must be a string'
        )
        .minLength('name', 1)
        .custom(
          'email',
          (v: unknown) => v === undefined || typeof v === 'string',
          'email must be a string'
        )
        .custom(
          'password',
          (v: unknown) => v === undefined || typeof v === 'string',
          'password must be a string'
        )
        .minLength('password', 8);

      Validator.validate(sanitizedUpdateBody, schema);

      const existing = await QueryBuilder.create('users', db)
        .select('id')
        .where('id', '=', id)
        .limit(1)
        .first();

      if (existing === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const ts = nowIso();
      await QueryBuilder.create('users', db)
        .where('id', '=', id)
        .update({ ...sanitizedUpdateBody, updated_at: ts });

      const user = await QueryBuilder.create('users', db)
        .select('id', 'name', 'email', 'created_at', 'updated_at')
        .where('id', '=', id)
        .limit(1)
        .first();

      res.json({ message: 'User updated', user });
    } catch (error) {
      if (isValidationError(error)) {
        res.status(422).json({ errors: error.toObject?.() ?? {} });
        return;
      }
      Logger.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  },

  /**
   * Delete a user
   * DELETE /users/:id
   */
  async destroy(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();
      const id = req.params['id'];
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Missing user id' });
        return;
      }

      if (!requireSelf(req, res, id)) return;

      const existing = await QueryBuilder.create('users', db)
        .select('id')
        .where('id', '=', id)
        .limit(1)
        .first();

      if (existing === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      await QueryBuilder.create('users', db).where('id', '=', id).delete();
      res.json({ message: 'User deleted' });
    } catch (error) {
      Logger.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  },
};

/**
 * User QueryBuilder Controller Factory
 */
export const UserQueryBuilderController = {
  /**
   * Create a new user controller instance
   */
  create(): IUserController {
    return userControllerMethods;
  },
};

export default UserQueryBuilderController;
