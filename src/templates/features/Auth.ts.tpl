import { Logger } from '@config/logger';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export const Auth = Object.freeze({
  /**
   * Hash a password
   */
  async hash(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  },

  /**
   * Compare a password with a hash
   */
  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  /**
   * Generate a JWT token
   */
  generateToken(payload: object, secret: string, expiresIn = '1h'): string {
    return jwt.sign(payload, secret, { expiresIn });
  },

  /**
   * Verify a JWT token
   */
  verifyToken<T>(token: string, secret: string): T {
    return jwt.verify(token, secret) as T;
  }
});
