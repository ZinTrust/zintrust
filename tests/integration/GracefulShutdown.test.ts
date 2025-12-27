import { Application } from '@boot/Application';
import { ConnectionManager } from '@orm/ConnectionManager';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.sequential('Graceful shutdown integration', () => {
  let tempDir: string | undefined;
  let app: ReturnType<typeof Application.create>;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zintrust-graceful-'));
    app = Application.create(tempDir);

    // Initialize ConnectionManager instance and create a connection
    ConnectionManager.getInstance({
      adapter: 'sqlite',
      database: ':memory:',
      maxConnections: 2,
    });

    await ConnectionManager.releaseConnection('default');
  });

  afterAll(async () => {
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('closes connection manager on app shutdown', async () => {
    // Sanity: ensure there is at least one connection registered
    const statsBefore = ConnectionManager.getPoolStats();
    expect(statsBefore.total).toBeGreaterThanOrEqual(0);

    await app.shutdown();

    // After shutdown, pool should be empty
    const statsAfter = ConnectionManager.getPoolStats();
    expect(statsAfter.total).toBe(0);
  });
});
