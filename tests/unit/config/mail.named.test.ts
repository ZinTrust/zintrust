import { mailConfig } from '@/config/mail';
import { describe, expect, it } from 'vitest';

describe('Mail Config (named mailers)', () => {
  it('throws when requesting an unknown mailer name explicitly', () => {
    expect(() => mailConfig.getDriver('does-not-exist')).toThrow(/Mail driver not configured/);
  });

  it('returns the disabled driver for the built-in disabled mailer', () => {
    const drv = mailConfig.getDriver('disabled');
    expect(drv.driver).toBe('disabled');
  });
});
