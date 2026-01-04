import { describe, expect, it } from 'vitest';

describe('core entrypoint exports', () => {
  it('exposes key exports from the root entrypoint', async () => {
    const core = await import('@zintrust/core');

    // These are sanity checks to ensure the entrypoint is evaluated and
    // re-exports are present (also important for patch/diff coverage).
    expect(core.AwsSigV4).toBeDefined();
    expect(core.SignedRequest).toBeDefined();

    expect(core.StorageDriverRegistry).toBeDefined();
    expect(core.S3Driver).toBeDefined();
    expect(core.R2Driver).toBeDefined();
    expect(core.GcsDriver).toBeDefined();

    expect(core.SendGridDriver).toBeDefined();
    expect(core.MailgunDriver).toBeDefined();

    expect(core.Queue).toBeDefined();
    expect(core.RedisQueue).toBeDefined();
  });
});
