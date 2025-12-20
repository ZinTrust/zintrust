/**
 * Encryptor
 * Password hashing with dual support: PBKDF2 (default) and optional bcrypt
 */

import { Logger } from '@config/logger';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

/**
 * Hash algorithm selector
 */
export type HashAlgorithm = 'pbkdf2' | 'bcrypt';

interface BcryptModule {
  hash: (data: string, saltOrRounds: string | number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
}

let algorithm: HashAlgorithm = 'pbkdf2';
let bcrypt: BcryptModule | undefined;
let loadingPromise: Promise<void> | undefined;

async function loadBcrypt(): Promise<void> {
  try {
    // @ts-expect-error - bcrypt is an optional dependency
    const module = (await import('bcrypt')) as { default?: BcryptModule } & BcryptModule;
    bcrypt = module.default ?? (module as BcryptModule);
    algorithm = 'bcrypt';
  } catch (error) {
    Logger.error('bcrypt not installed, falling back to PBKDF2', error);
    // bcrypt not installed, will use PBKDF2
    algorithm = 'pbkdf2';
  }
}

async function ensureLoaded(): Promise<void> {
  if (bcrypt !== undefined) return;
  if (loadingPromise !== undefined) return loadingPromise;

  loadingPromise = loadBcrypt();
  return loadingPromise;
}

/**
 * Timing-safe string comparison
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }

  return result === 0;
}

/**
 * Hash with PBKDF2 (default)
 */
function hashPbkdf2(password: string): string {
  const iterations = 100000;
  const salt = randomBytes(32).toString('hex');
  const keyLength = 64;
  const digest = 'sha256';

  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString('hex');

  // Format: algorithm$iterations$salt$hash
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

/**
 * Verify PBKDF2 hash
 */
function verifyPbkdf2(password: string, hash: string): boolean {
  const parts = hash.split('$');
  const iterationsStr = parts[1];
  const salt = parts[2];
  const storedHash = parts[3];

  if (iterationsStr === undefined || salt === undefined || storedHash === undefined) {
    return false;
  }

  try {
    const iterations = Number.parseInt(iterationsStr, 10);
    const keyLength = 64;
    const digest = 'sha256';

    const computed = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString('hex');
    return timingSafeEquals(computed, storedHash);
  } catch (error) {
    Logger.error('PBKDF2 verification failed', error);
    return false;
  }
}

/**
 * Hash with bcrypt
 */
async function hashBcrypt(password: string): Promise<string> {
  const rounds = 12;
  return bcrypt === undefined ? '' : bcrypt.hash(password, rounds);
}

/**
 * Verify bcrypt hash
 */
async function verifyBcrypt(password: string, hash: string): Promise<boolean> {
  return bcrypt === undefined ? false : bcrypt.compare(password, hash);
}

/**
 * Encryptor handles password hashing and verification
 */
export const Encryptor = {
  /**
   * Hash a password
   */
  async hash(password: string): Promise<string> {
    await ensureLoaded();
    if (algorithm === 'bcrypt' && bcrypt !== undefined) {
      return hashBcrypt(password);
    }
    return hashPbkdf2(password);
  },

  /**
   * Verify password against hash
   */
  async verify(password: string, hash: string): Promise<boolean> {
    await ensureLoaded();
    // Detect hash format
    if (hash.startsWith('$2')) {
      // bcrypt hash format
      if (bcrypt !== undefined) {
        return verifyBcrypt(password, hash);
      }
      throw new Error('bcrypt not available to verify hash');
    }

    // PBKDF2 hash format (algorithm$iterations$salt$hash)
    return verifyPbkdf2(password, hash);
  },

  /**
   * Get current algorithm
   */
  getAlgorithm(): HashAlgorithm {
    return algorithm;
  },
};
