import { resetDatabase, useDatabase } from '@orm/Database';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DatabaseUseDatabaseNamed', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('creates distinct instances for different connection names', () => {
    const a = useDatabase({ driver: 'sqlite', database: ':memory:' }, 'connA');
    const b = useDatabase({ driver: 'sqlite', database: ':memory:' }, 'connB');
    expect(a).not.toBe(b);
  });

  it('returns same instance for the same connection name', () => {
    const a = useDatabase({ driver: 'sqlite', database: ':memory:' }, 'same');
    const b = useDatabase({ driver: 'sqlite', database: ':memory:' }, 'same');
    expect(a).toBe(b);
  });

  it('resetDatabase clears instances', async () => {
    const a = useDatabase({ driver: 'sqlite', database: ':memory:' }, 'temp');
    await resetDatabase();
    const b = useDatabase({ driver: 'sqlite', database: ':memory:' }, 'temp');
    expect(a).not.toBe(b);
  });
});
