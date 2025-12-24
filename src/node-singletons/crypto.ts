/**
 * Node.js Crypto Module Singleton
 * Safe to import in both API and CLI code
 * Exported from node:crypto built-in
 */

export {
  createHash,
  createHmac,
  createSign,
  createVerify,
  generateKeyPairSync,
  pbkdf2Sync,
  randomBytes,
  randomInt,
} from 'node:crypto';
