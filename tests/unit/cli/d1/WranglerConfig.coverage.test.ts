import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('cli/d1/WranglerConfig (coverage)', () => {
  it('returns default migrations dir when config missing', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => false,
      readFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const { WranglerConfig } = await import('../../../../src/cli/d1/WranglerConfig');
    expect(WranglerConfig.getD1MigrationsDir('/repo')).toBe('migrations');
  });

  it('parses JSONC with comments and respects dbName match + migrations_dir', async () => {
    const jsonc = `{
      // comment line
      "d1_databases": [
        { "database_name": "main", "migrations_dir": "db/migs" },
        { "database_name": "other", "migrations_dir": "other" }
      ],
      /* block comment */
      "note": "keep // inside string"
    }`;

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      readFileSync: () => jsonc,
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const { WranglerConfig } = await import('../../../../src/cli/d1/WranglerConfig');
    expect(WranglerConfig.getD1MigrationsDir('/repo', 'main')).toBe('db/migs');
  });

  it('resolves the configured D1 record and default database name', async () => {
    const jsonc = `{
      "d1_databases": [
        { "database_name": "d1-proxy-db", "binding": "ZIN_DB", "migrations_dir": "database/migrations/d1" }
      ]
    }`;

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      readFileSync: () => jsonc,
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const { WranglerConfig } = await import('../../../../src/cli/d1/WranglerConfig');
    expect(WranglerConfig.getDefaultD1DatabaseName('/repo')).toBe('d1-proxy-db');
    expect(WranglerConfig.getD1Database('/repo', 'ZIN_DB')).toEqual(
      expect.objectContaining({ database_name: 'd1-proxy-db', binding: 'ZIN_DB' })
    );
    expect(WranglerConfig.getD1Databases('/repo')).toHaveLength(1);
    expect(WranglerConfig.getDefaultD1Database('/repo')).toEqual(
      expect.objectContaining({ database_name: 'd1-proxy-db', binding: 'ZIN_DB' })
    );
  });

  it('falls back to binding name and returns undefined when no D1 config exists', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      readFileSync: () => '{"d1_databases":[{"binding":"ZIN_DB_ONLY"}]}',
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const { WranglerConfig } = await import('../../../../src/cli/d1/WranglerConfig');
    expect(WranglerConfig.getDefaultD1DatabaseName('/repo')).toBe('ZIN_DB_ONLY');

    vi.resetModules();
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => false,
      readFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const mod2 = await import('../../../../src/cli/d1/WranglerConfig');
    expect(mod2.WranglerConfig.getDefaultD1DatabaseName('/repo')).toBeUndefined();
  });

  it('returns undefined when the configured D1 entry has no usable name', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      readFileSync: () => '{"d1_databases":[{"database_name":"   ","binding":"   "}]}',
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const { WranglerConfig } = await import('../../../../src/cli/d1/WranglerConfig');
    expect(WranglerConfig.getDefaultD1DatabaseName('/repo')).toBeUndefined();
  });

  it('falls back to default when JSON is invalid or migrations_dir is blank', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      readFileSync: () => '{ invalid json',
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const { WranglerConfig } = await import('../../../../src/cli/d1/WranglerConfig');
    expect(WranglerConfig.getD1MigrationsDir('/repo', 'main')).toBe('migrations');

    vi.resetModules();
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      readFileSync: () => '{"d1_databases":[{"database_name":"main","migrations_dir":"   "}]}',
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    const mod2 = await import('../../../../src/cli/d1/WranglerConfig');
    expect(mod2.WranglerConfig.getD1MigrationsDir('/repo', 'main')).toBe('migrations');
  });
});
