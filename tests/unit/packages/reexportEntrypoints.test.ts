import { describe, expect, it } from 'vitest';

import {
  GcsDriver,
  MailgunDriver,
  R2Driver,
  S3Driver,
  SendGridDriver,
  SmtpDriver,
} from '../../../src/index';

describe('adapter packages entrypoints (re-exports)', () => {
  it('re-exports queue-redis', async () => {
    const pkg = (await import('../../../packages/queue-redis/src/index.js')) as {
      BullMQRedisQueue: unknown;
    };
    expect(typeof pkg.BullMQRedisQueue).toBe('object');
    expect(typeof (pkg.BullMQRedisQueue as { enqueue?: unknown }).enqueue).toBe('function');
  });

  it('re-exports storage drivers', async () => {
    const s3 = (await import('../../../packages/storage-s3/src/index.js')) as { S3Driver: unknown };
    const r2 = (await import('../../../packages/storage-r2/src/index.js')) as { R2Driver: unknown };
    const gcs = (await import('../../../packages/storage-gcs/src/index.js')) as {
      GcsDriver: unknown;
    };

    expect(s3.S3Driver).toBe(S3Driver);
    expect(r2.R2Driver).toBe(R2Driver);
    expect(gcs.GcsDriver).toBe(GcsDriver);
  });

  it('re-exports mail drivers', async () => {
    const smtp = (await import('../../../packages/mail-smtp/src/index.js')) as {
      SmtpDriver: unknown;
    };
    const sendgrid = (await import('../../../packages/mail-sendgrid/src/index.js')) as {
      SendGridDriver: unknown;
    };
    const mailgun = (await import('../../../packages/mail-mailgun/src/index.js')) as {
      MailgunDriver: unknown;
    };

    expect(smtp.SmtpDriver).toBe(SmtpDriver);
    expect(sendgrid.SendGridDriver).toBe(SendGridDriver);
    expect(mailgun.MailgunDriver).toBe(MailgunDriver);
  });
});
