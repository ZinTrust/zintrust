/**
 * User QueryBuilder Controller
 * QueryBuilder-backed controller for the users resource.
 */

import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';
import { randomBytes } from '@node-singletons/crypto';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { Schema, Validator } from '@validation/Validator';

type JsonRecord = Record<string, unknown>;

type ValidationErrorLike = {
  name?: unknown;
  toObject?: () => Record<string, string[]>;
};

const isValidationError = (error: unknown): error is ValidationErrorLike => {
  if (typeof error !== 'object' || error === null) return false;
  const maybe = error as ValidationErrorLike;
  return maybe.name === 'ValidationError' && typeof maybe.toObject === 'function';
};

const ensureDbConnected = async (): Promise<ReturnType<typeof useDatabase>> => {
  const db = useDatabase(undefined, 'default');
  if (db.isConnected() === false) {
    await db.connect();
  }
  return db;
};

const nowIso = (): string => new Date().toISOString();

const parseCount = (value: unknown): number => {
  if (value === undefined || value === null) return 10;
  if (typeof value !== 'number' || !Number.isFinite(value)) return Number.NaN;
  return Math.trunc(value);
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
 * User Controller Interface
 */
export interface IUserController {
  index(req: IRequest, res: IResponse): Promise<void>;
  show(req: IRequest, res: IResponse): Promise<void>;
  create(req: IRequest, res: IResponse): Promise<void>;
  store(req: IRequest, res: IResponse): Promise<void>;
  fill(req: IRequest, res: IResponse): Promise<void>;
  edit(req: IRequest, res: IResponse): Promise<void>;
  update(req: IRequest, res: IResponse): Promise<void>;
  destroy(req: IRequest, res: IResponse): Promise<void>;
}

/**
 * User Controller Methods
 */
const userControllerMethods: IUserController = {
  /**
   * List all users
   * GET /users
   */
  async index(_req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await ensureDbConnected();
      const users = await QueryBuilder.create('users', db)
        .select('id', 'name', 'email', 'created_at', 'updated_at')
        .orderBy('id', 'DESC')
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
      const db = await ensureDbConnected();
      const id = req.params['id'];
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Missing user id' });
        return;
      }

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
      const body = req.body as JsonRecord;
      const schema = Schema.create()
        .required('name')
        .string('name')
        .minLength('name', 1)
        .required('email')
        .email('email')
        .custom(
          'password',
          (v) => v === undefined || typeof v === 'string',
          'password must be a string'
        )
        .minLength('password', 8);

      Validator.validate(body, schema);

      const db = await ensureDbConnected();
      const ts = nowIso();
      const password = typeof body['password'] === 'string' ? body['password'] : '';

      await QueryBuilder.create('users', db).insert({
        name: String(body['name'] ?? ''),
        email: String(body['email'] ?? ''),
        password,
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
      const body = req.body as JsonRecord;
      const schema = Schema.create()
        .custom(
          'count',
          (v) => v === undefined || (typeof v === 'number' && Number.isFinite(v)),
          'count must be a number'
        )
        .min('count', 1)
        .max('count', 100);

      Validator.validate(body, schema);

      const count = parseCount(body['count']);
      if (!Number.isFinite(count) || count < 1 || count > 100) {
        res.status(422).json({ errors: { count: ['count must be between 1 and 100'] } });
        return;
      }

      const db = await ensureDbConnected();
      const ts = nowIso();

      const insertPromises = Array.from({ length: count }, async () =>
        QueryBuilder.create('users', db).insert({
          name: randomName(),
          email: randomEmail(),
          password: randomPassword(),
          created_at: ts,
          updated_at: ts,
        })
      );

      await Promise.all(insertPromises);

      res.status(201).json({ message: 'Users filled', count });
    } catch (error) {
      if (isValidationError(error)) {
        res.status(422).json({ errors: error.toObject?.() ?? {} });
        return;
      }
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
      const db = await ensureDbConnected();
      const id = req.params['id'];
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Missing user id' });
        return;
      }

      const allowed = new Set(['name', 'email', 'password']);
      const body = req.body as JsonRecord;
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

      const schema = Schema.create()
        .custom('name', (v) => v === undefined || typeof v === 'string', 'name must be a string')
        .minLength('name', 1)
        .custom('email', (v) => v === undefined || typeof v === 'string', 'email must be a string')
        .custom(
          'password',
          (v) => v === undefined || typeof v === 'string',
          'password must be a string'
        )
        .minLength('password', 8);

      Validator.validate(updateBody, schema);

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
        .update({ ...updateBody, updated_at: ts });

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
      const db = await ensureDbConnected();
      const id = req.params['id'];
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Missing user id' });
        return;
      }

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
