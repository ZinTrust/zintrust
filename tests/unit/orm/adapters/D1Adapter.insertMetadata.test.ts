import { D1Adapter } from '@orm/adapters/D1Adapter';
import { afterEach, describe, expect, it } from 'vitest';

describe('D1Adapter insert metadata', () => {
  afterEach(() => {
    delete (globalThis as { env?: unknown }).env;
  });

  it('maps D1 meta.last_row_id to lastInsertId', async () => {
    const run = async () => ({
      success: true,
      meta: {
        changes: 1,
        last_row_id: 42,
      },
    });

    (globalThis as { env?: unknown }).env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            all: async () => {
              throw new Error('INSERT should use run(), not all()');
            },
            first: async () => null,
            run,
          }),
        }),
      },
    };

    const adapter = D1Adapter.create({ driver: 'd1' });
    await adapter.connect();

    const out = await adapter.query('INSERT INTO users(name) VALUES (?)', ['A']);
    expect(out.rowCount).toBe(1);
    expect(out.lastInsertId).toBe(42);
  });
});
