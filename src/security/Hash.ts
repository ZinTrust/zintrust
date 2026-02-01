/**
 * Hash
 * bcrypt-based password hashing utility.
 *
 * Uses bcryptjs to avoid native module issues in edge runtimes.
 */

import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import bcrypt from 'bcryptjs';

const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const Hash = Object.freeze({
  isValidHash(hash: string): boolean {
    return BCRYPT_HASH_RE.test(hash);
  },

  async hash(plaintext: string): Promise<string> {
    try {
      return await bcrypt.hash(plaintext, 12);
    } catch (error: unknown) {
      Logger.error('Password hashing failed', error);
      throw ErrorFactory.createSecurityError('Password hashing failed', error);
    }
  },

  async hashWithRounds(plaintext: string, rounds: number): Promise<string> {
    const normalizedRounds = Number.isFinite(rounds) ? Math.trunc(rounds) : 0;
    if (normalizedRounds <= 0) {
      throw ErrorFactory.createConfigError('Invalid bcrypt rounds', { rounds });
    }

    try {
      return await bcrypt.hash(plaintext, normalizedRounds);
    } catch (error: unknown) {
      Logger.error('Password hashing failed', error);
      throw ErrorFactory.createSecurityError('Password hashing failed', error);
    }
  },

  async verify(plaintext: string, hashed: string): Promise<boolean> {
    if (!Hash.isValidHash(hashed)) return false;

    try {
      return await bcrypt.compare(plaintext, hashed);
    } catch (error: unknown) {
      Logger.error('Password verify failed', error);
      return false;
    }
  },
});

export default Hash;
