import { BaseDriver as MailBase } from '@tools/mail/drivers/BaseDriver';
import { describe, expect, it } from 'vitest';

describe('Mail BaseDriver', () => {
  it('send throws config error', async () => {
    await expect(MailBase.send()).rejects.toBeDefined();
  });
});
