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

  it('throws when BROADCAST_DRIVER selects an unknown name', () => {
    process.env['BROADCAST_DRIVER'] = 'nope';
    expect(() => broadcastConfig.getDriverName()).toThrow(/Broadcast driver not configured/);
    delete process.env['BROADCAST_DRIVER'];
  });

  it('throws when explicitly selecting an unknown broadcaster', () => {
    expect(() => broadcastConfig.getDriverConfig('nope' as any)).toThrow(
      /Broadcast driver not configured/
    );
  });

  it("treats 'default' as an alias of the configured default", () => {
    const resolved = broadcastConfig.getDriverConfig();
    const defaultAlias = broadcastConfig.getDriverConfig('default');
    expect(defaultAlias.driver).toBe(resolved.driver);
  });
});
