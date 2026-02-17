import { describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{"d1_databases":[{"binding":"db","migrations_dir":"mig"}]},\n'),
}));

vi.mock('@node-singletons/path', async () => {
  const actual = await vi.importActual<any>('@node-singletons/path');
  return actual;
});

import { WranglerConfig } from '@cli/d1/WranglerConfig';

describe('WranglerConfig (coverage extras)', () => {
  it('drops trailing comma at end-of-file and reads migrations_dir', () => {
    const dir = WranglerConfig.getD1MigrationsDir('/proj', 'db');
    expect(dir).toBe('mig');
  });
});
