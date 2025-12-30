/**
 * Hash
 * bcrypt-based password hashing utility.
 *
 * Runtime-aware: uses dynamic import for bcrypt.
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';

interface BcryptModule {
  hash: (data: string, saltOrRounds: string | number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
}

function isBcryptModule(value: unknown): value is BcryptModule {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['hash'] === 'function' && typeof record['compare'] === 'function';
}

let bcrypt: BcryptModule | undefined;
let loadingPromise: Promise<void> | undefined;

async function loadBcrypt(): Promise<void> {
  const imported: unknown = await import('bcrypt');
  const module = imported as { default?: unknown } & Record<string, unknown>;
  const candidate: unknown = module.default ?? module;

  if (!isBcryptModule(candidate)) {
    throw ErrorFactory.createConfigError('Invalid bcrypt module shape');
  }

  bcrypt = candidate;
}

async function ensureBcrypt(): Promise<BcryptModule> {
  if (bcrypt !== undefined) return bcrypt;
  loadingPromise ??= loadBcrypt().catch((error: unknown) => {
    Logger.error('bcrypt unavailable', error);
    throw ErrorFactory.createConfigError('bcrypt unavailable', error);
  });

  await loadingPromise;
  if (bcrypt === undefined) {
    throw ErrorFactory.createConfigError('bcrypt unavailable');
  }
  return bcrypt;
}

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const Hash = Object.freeze({
  isValidHash(hash: string): boolean {
    return BCRYPT_HASH_RE.test(hash);
  },

  async hash(plaintext: string): Promise<string> {
    const bcryptModule = await ensureBcrypt();
    try {
      return await bcryptModule.hash(plaintext, 12);
    } catch (error: unknown) {
      Logger.error('Password hashing failed', error);
      throw ErrorFactory.createSecurityError('Password hashing failed', error);
    }
  },

  async hashWithRounds(plaintext: string, rounds: number): Promise<string> {
    const bcryptModule = await ensureBcrypt();

    const normalizedRounds = Number.isFinite(rounds) ? Math.trunc(rounds) : 0;
    if (normalizedRounds <= 0) {
      throw ErrorFactory.createConfigError('Invalid bcrypt rounds', { rounds });
    }

    try {
      return await bcryptModule.hash(plaintext, normalizedRounds);
    } catch (error: unknown) {
      Logger.error('Password hashing failed', error);
      throw ErrorFactory.createSecurityError('Password hashing failed', error);
    }
  },

  async verify(plaintext: string, hashed: string): Promise<boolean> {
    if (!Hash.isValidHash(hashed)) return false;

    try {
      const bcryptModule = await ensureBcrypt();
      return await bcryptModule.compare(plaintext, hashed);
    } catch (error: unknown) {
      Logger.error('Password verify failed', error);
      return false;
    }
  },
});

export default Hash;
