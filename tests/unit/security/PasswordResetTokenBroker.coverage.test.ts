import { PasswordResetTokenBroker } from '@security/PasswordResetTokenBroker';
import { describe, expect, it } from 'vitest';

describe('PasswordResetTokenBroker coverage', () => {
  it('throws on invalid ttl', () => {
    expect(() => PasswordResetTokenBroker.create({ ttlMs: 0 })).toThrow(
      'Invalid password reset TTL'
    );
  });
});
