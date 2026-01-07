/**
 * Node.js Crypto Module Singleton
 * Safe to import in both API and CLI code
 * Exported from node:crypto built-in
 */

export {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  createVerify,
  generateKeyPairSync,
  pbkdf2Sync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
