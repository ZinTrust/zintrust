/**
 * Encryptor
 * Password hashing with dual support: PBKDF2 (default) and optional bcrypt
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

/**
 * Hash algorithm selector
 */
export type HashAlgorithm = 'pbkdf2' | 'bcrypt';

interface BcryptModule {
  hash: (data: string, saltOrRounds: string | number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
}

function isBcryptModule(value: unknown): value is BcryptModule {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return typeof record['hash'] === 'function' && typeof record['compare'] === 'function';
}

let algorithm: HashAlgorithm = 'pbkdf2';
let bcrypt: BcryptModule | undefined;
let loadingPromise: Promise<void> | undefined;

async function loadBcrypt(): Promise<void> {
  try {
    const imported: unknown = await import('bcrypt');
    const module = imported as { default?: unknown } & Record<string, unknown>;
    const candidate: unknown = module.default ?? module;

    if (!isBcryptModule(candidate)) {
      throw ErrorFactory.createConfigError('Invalid bcrypt module shape');
    }

    bcrypt = candidate;
    algorithm = 'bcrypt';
  } catch (error) {
    Logger.error('bcrypt not installed, falling back to PBKDF2', error);
    ErrorFactory.createSecurityError('bcrypt not installed, falling back to PBKDF2', error);
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
  const iterations = 600000; // OWASP recommended for SHA-256
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
function verifyPbkdf2(password: string, passwordHash: string): boolean {
  const parts = passwordHash.split('$');
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
    ErrorFactory.createSecurityError('PBKDF2 verification failed', error);
    return false;
  }
}

/**
 * Hash with bcrypt
 */
async function hashBcrypt(bcryptModule: BcryptModule, password: string): Promise<string> {
  const rounds = 12;
  return bcryptModule.hash(password, rounds);
}

/**
 * Verify bcrypt hash
 */
async function verifyBcrypt(
  bcryptModule: BcryptModule,
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcryptModule.compare(password, passwordHash);
}

export interface IEncryptor {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  getAlgorithm(): HashAlgorithm;
}

/**
 * Encryptor handles password hashing and verification
 * Refactored to Functional Object pattern
 */
const hash = async (password: string): Promise<string> => {
  await ensureLoaded();
  if (algorithm === 'bcrypt' && bcrypt !== undefined) {
    return hashBcrypt(bcrypt, password);
  }
  return hashPbkdf2(password);
};

/**
 * Verify password against hash
 */
const verify = async (password: string, passwordHash: string): Promise<boolean> => {
  await ensureLoaded();
  // Detect hash format
  if (passwordHash.startsWith('$2')) {
    // bcrypt hash format
    if (bcrypt !== undefined) {
      return verifyBcrypt(bcrypt, password, passwordHash);
    }
    throw ErrorFactory.createConfigError('bcrypt not available to verify hash');
  }

  // PBKDF2 hash format (algorithm$iterations$salt$hash)
  return verifyPbkdf2(password, passwordHash);
};

/**
 * Get current algorithm
 */
const getAlgorithm = (): HashAlgorithm => {
  return algorithm;
};

export const Encryptor: IEncryptor = Object.freeze({
  hash,
  verify,
  getAlgorithm,
});
