import { describe, expect, it } from 'vitest';

import { Mail } from '@mail/Mail';

describe('Mail.mailer patch coverage (extra)', () => {
  it('returns a mailer instance', () => {
    const mailer = Mail.mailer('transactional');
    expect(mailer).toHaveProperty('send');
    expect(typeof (mailer as any).send).toBe('function');
  });
});
