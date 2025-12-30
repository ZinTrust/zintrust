import { BaseDriver } from '@notification/drivers/BaseDriver';
import { describe, expect, it } from 'vitest';

describe('Notification Base Driver', () => {
  it('throws when send not implemented', async () => {
    await expect(BaseDriver.send()).rejects.toThrow();
  });
});
