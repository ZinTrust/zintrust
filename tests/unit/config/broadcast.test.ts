import broadcastConfig from '@config/broadcast';
import { describe, expect, it } from 'vitest';

describe('broadcast config', () => {
  it('defaults to inmemory', () => {
    expect(broadcastConfig.getDriverName()).toBe('inmemory');
    expect(broadcastConfig.getDriverConfig().driver).toBe('inmemory');
  });

  it('normalizes BROADCAST_DRIVER from env', () => {
    process.env['BROADCAST_DRIVER'] = ' ReDiS ';
    expect(broadcastConfig.getDriverName()).toBe('redis');
    expect(broadcastConfig.getDriverConfig().driver).toBe('redis');
    delete process.env['BROADCAST_DRIVER'];
  });
});
