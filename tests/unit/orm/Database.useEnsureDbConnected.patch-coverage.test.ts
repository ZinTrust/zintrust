import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase, useEnsureDbConnected } from '@orm/Database';

afterEach(async () => {
  await resetDatabase();
  vi.restoreAllMocks();
});

describe('useEnsureDbConnected (patch coverage)', () => {
  it('connects when database is not connected', async () => {
    const db = await useEnsureDbConnected({ driver: 'sqlite', database: ':memory:' }, 'default');
    expect(db.isConnected()).toBe(true);
  });

  it('does not call connect when already connected', async () => {
    const db = await useEnsureDbConnected({ driver: 'sqlite', database: ':memory:' }, 'default');

    // If useEnsureDbConnected tries to reconnect, this will fail the test.
    (db as any).connect = vi.fn(async () => {
      throw new Error('should not reconnect');
    });

    const again = await useEnsureDbConnected(undefined, 'default');
    expect(again).toBe(db);
    expect((db as any).connect).not.toHaveBeenCalled();
  });
});
