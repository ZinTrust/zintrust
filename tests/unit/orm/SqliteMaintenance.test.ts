import { describe, expect, it, vi } from 'vitest';

import { SqliteMaintenance } from '@orm/maintenance/SqliteMaintenance';

describe('SqliteMaintenance', () => {
  it('throws when db is not sqlite', async () => {
    const db: any = {
      getType: () => 'mysql',
      getAdapterInstance: () => ({ resetSchema: vi.fn() }),
    };

    await expect(SqliteMaintenance.dropAllTables(db)).rejects.toMatchObject({
      message: expect.stringContaining('only supported for sqlite'),
    });
  });

  it('throws when sqlite adapter lacks resetSchema()', async () => {
    const db: any = {
      getType: () => 'sqlite',
      getAdapterInstance: () => ({}),
    };

    await expect(SqliteMaintenance.dropAllTables(db)).rejects.toMatchObject({
      message: expect.stringContaining('does not support resetSchema'),
    });
  });

  it('calls adapter.resetSchema() for sqlite db', async () => {
    const resetSchema = vi.fn().mockResolvedValue(undefined);

    const db: any = {
      getType: () => 'sqlite',
      getAdapterInstance: () => ({ resetSchema }),
    };

    await SqliteMaintenance.dropAllTables(db);
    expect(resetSchema).toHaveBeenCalledTimes(1);
  });
});
