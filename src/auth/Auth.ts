// TEMPLATE_START
import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

const { sign, verify } = jwt;

export const Auth = Object.freeze({
  /**
   * Hash a password
   */
  async hash(password: string): Promise<string> {
    const salt: string = await bcrypt.genSalt(10);
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
  generateToken(
    payload: Record<string, unknown>,
    secret: Secret,
    expiresIn: NonNullable<SignOptions['expiresIn']> = '1h'
  ): string {
    const options: SignOptions = { expiresIn };
    return sign(payload, secret, options);
  },

  /**
   * Verify a JWT token
   */
  verifyToken<T>(token: string, secret: Secret): T {
    return verify(token, secret) as T;
  },
});
// TEMPLATE_END
