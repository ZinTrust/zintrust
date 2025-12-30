import { ConnectionManager } from '@orm/ConnectionManager';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ConnectionManager (extra tests)', () => {
  beforeEach(async () => {
    // Ensure any existing instance is shut down
    await ConnectionManager.shutdownIfInitialized();
  });

  afterEach(async () => {
    await ConnectionManager.shutdownIfInitialized();
  });

  it('creates, releases and reuses a connection and reports pool stats', async () => {
    const cfg = { adapter: 'sqlite', database: 'testdb', maxConnections: 2 } as const;

    // initialize instance
    const instance = ConnectionManager.getInstance(cfg);

    const conn = await instance.getConnection('default');
    expect(conn).toBeDefined();
    expect((conn as any).adapter).toBe('sqlite');

    const stats1 = instance.getPoolStats();
    expect(stats1.total).toBe(1);
    expect(stats1.active).toBe(1);
    expect(stats1.idle).toBe(0);

    // release connection back to pool
    await instance.releaseConnection('default');
    const stats2 = instance.getPoolStats();
    expect(stats2.total).toBe(1);
    expect(stats2.active).toBe(0);
    expect(stats2.idle).toBe(1);

    // get connection again (should reuse existing healthy connection)
    const conn2 = await instance.getConnection('default');
    expect((conn2 as any).id).toBe((conn as any).id);

    // enable rds proxy mutates config safely
    await instance.enableRdsProxy('rds-proxy.local');

    // aurora data api connection exposes execute that throws config error
    const a = await instance.getAuroraDataApiConnection();
    await expect(a.execute('SELECT 1')).rejects.toThrow(/Aurora Data API not implemented/);

    // close everything
    await instance.closeAll();
    const stats3 = instance.getPoolStats();
    expect(stats3.total).toBe(0);
  });

  it('returns an instance after shutdownIfInitialized if previously initialized', async () => {
    // shutdown clears connections but the module keeps the instance reference
    await ConnectionManager.shutdownIfInitialized();
    const inst = ConnectionManager.getInstance();
    expect(inst).toBeDefined();
    expect(typeof inst.getConnection).toBe('function');
  });
});
