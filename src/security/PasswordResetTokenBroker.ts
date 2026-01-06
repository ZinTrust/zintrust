/**
 * Password Reset Token Broker
 *
 * Framework-agnostic, storage-pluggable password reset token flow.
 *
 * - Generates high-entropy tokens for a given identifier (usually an email).
 * - Stores only a SHA-256 hash of the token (one active token per identifier).
 * - Supports verification and one-time consumption.
 */

import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHash, randomBytes } from '@node-singletons/crypto';

export interface PasswordResetTokenRecord {
  identifier: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IPasswordResetTokenStore {
  set(record: PasswordResetTokenRecord): void | Promise<void>;
  get(
    identifier: string
  ): PasswordResetTokenRecord | null | Promise<PasswordResetTokenRecord | null>;
  delete(identifier: string): void | Promise<void>;
  cleanup?(now?: Date): number | Promise<number>;
  clear?(): void | Promise<void>;
}

export interface IPasswordResetTokenBroker {
  createToken(identifier: string): Promise<string>;
  verifyToken(identifier: string, token: string): Promise<boolean>;
  consumeToken(identifier: string, token: string): Promise<boolean>;
}

export interface PasswordResetTokenBrokerOptions {
  store?: IPasswordResetTokenStore;
  ttlMs?: number;
  tokenBytes?: number;
  now?: () => Date;
}

export interface PasswordResetTokenBrokerType {
  create(options?: PasswordResetTokenBrokerOptions): IPasswordResetTokenBroker;
  createInMemoryStore(): IPasswordResetTokenStore;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_TOKEN_BYTES = 32; // 256 bits

const createInMemoryStore = (): IPasswordResetTokenStore => {
  const map = new Map<string, PasswordResetTokenRecord>();

  return {
    set(record: PasswordResetTokenRecord): void {
      map.set(record.identifier, record);
    },

    get(identifier: string): PasswordResetTokenRecord | null {
      return map.get(identifier) ?? null;
    },

    delete(identifier: string): void {
      map.delete(identifier);
    },

    cleanup(now: Date = new Date()): number {
      let removed = 0;
      for (const [identifier, record] of map.entries()) {
        if (now.getTime() > record.expiresAt.getTime()) {
          map.delete(identifier);
          removed++;
        }
      }
      return removed;
    },

    clear(): void {
      map.clear();
    },
  };
};

const create = (options: PasswordResetTokenBrokerOptions = {}): IPasswordResetTokenBroker => {
  const store = options.store ?? createInMemoryStore();
  const ttlMs = normalizeTtlMs(options.ttlMs ?? DEFAULT_TTL_MS);
  const tokenBytes = normalizeTokenBytes(options.tokenBytes ?? DEFAULT_TOKEN_BYTES);
  const now = options.now ?? (() => new Date());

  return {
    async createToken(identifier: string): Promise<string> {
      const normalizedIdentifier = normalizeIdentifier(identifier);

      const token = randomBytes(tokenBytes).toString('hex');
      const tokenHash = sha256Hex(token);
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + ttlMs);

      await store.set({ identifier: normalizedIdentifier, tokenHash, createdAt, expiresAt });
      return token;
    },

    async verifyToken(identifier: string, token: string): Promise<boolean> {
      const normalizedIdentifier = normalizeIdentifier(identifier);
      const normalizedToken = normalizeToken(token);

      const record = await store.get(normalizedIdentifier);
      if (record === null) return false;

      if (isExpired(record, now())) {
        await store.delete(normalizedIdentifier);
        return false;
      }

      const computed = sha256Hex(normalizedToken);
      return timingSafeEquals(record.tokenHash, computed);
    },

    async consumeToken(identifier: string, token: string): Promise<boolean> {
      const normalizedIdentifier = normalizeIdentifier(identifier);
      const ok = await this.verifyToken(normalizedIdentifier, token);
      if (!ok) return false;
      await store.delete(normalizedIdentifier);
      return true;
    },
  };
};

export const PasswordResetTokenBroker: PasswordResetTokenBrokerType = Object.freeze({
  create,
  createInMemoryStore,
});

function normalizeIdentifier(identifier: string): string {
  if (typeof identifier !== 'string') {
    throw ErrorFactory.createValidationError('Invalid identifier');
  }

  const trimmed = identifier.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createValidationError('Invalid identifier');
  }

  return trimmed;
}

function normalizeToken(token: string): string {
  if (typeof token !== 'string') {
    throw ErrorFactory.createValidationError('Invalid token');
  }

  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw ErrorFactory.createValidationError('Invalid token');
  }

  return trimmed;
}

function normalizeTtlMs(ttlMs: number): number {
  const value = Number.isFinite(ttlMs) ? Math.trunc(ttlMs) : 0;
  if (value <= 0) {
    throw ErrorFactory.createConfigError('Invalid password reset TTL', { ttlMs });
  }
  return value;
}

function normalizeTokenBytes(tokenBytes: number): number {
  const value = Number.isFinite(tokenBytes) ? Math.trunc(tokenBytes) : 0;
  if (value <= 0) {
    throw ErrorFactory.createConfigError('Invalid password reset token bytes', { tokenBytes });
  }
  return value;
}

function isExpired(record: PasswordResetTokenRecord, now: Date): boolean {
  return now.getTime() > record.expiresAt.getTime();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return result === 0;
}
