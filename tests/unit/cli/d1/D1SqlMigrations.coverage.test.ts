import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('cli/d1/D1SqlMigrations (coverage)', () => {
  it('compiles mutating SQL only, interpolates params, normalizes semicolons, writes files', async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const mkdirs: string[] = [];

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: (p: string) => p.includes('exists'),
      mkdirSync: (p: string) => mkdirs.push(p),
      writeFileSync: (p: string, content: string) => writes.push({ path: p, content }),
    }));

    vi.doMock('@node-singletons/path', async () => await import('node:path'));

    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: (dir: string) => {
          if (dir.includes('global')) return ['global-1.ts', 'global-2.ts'];
          return [];
        },
      },
    }));

    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: {
        load: async (file: string) => {
          if (file.includes('global-1')) {
            return {
              name: '20240101000000_create_users_table',
              up: async (db: any) => {
                await db.query('SELECT 1');
                await db.query('CREATE TABLE users(id INTEGER)');
                await db.query('INSERT INTO users(name) VALUES (?)', ["O'Reilly"]);
                await db.query('  ');
              },
            };
          }
          return {
            name: 'create_posts_table',
            up: async (db: any) => {
              await db.query('UPDATE posts SET a=1;');
              await db.query('DELETE FROM posts WHERE id=?', [123]);
            },
          };
        },
      },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    const out = await D1SqlMigrations.compileAndWrite({
      projectRoot: '/repo',
      globalDir: 'global',
      extension: '.ts',
      outputDir: '/out',
      includeGlobal: true,
    });

    // ensureDir called since outputDir doesn't "exist"
    expect(mkdirs).toContain('/out');

    // Two migrations => two output files
    expect(out).toHaveLength(2);
    expect(writes).toHaveLength(2);

    // First migration uses preserved numeric prefix
    expect(writes[0]?.path).toMatch(/20240101000000_create_users_table\.sql$/);
    expect(writes[0]?.content).toContain('-- Generated from 20240101000000_create_users_table');

    // Captures only mutating statements, normalizes + interpolates
    expect(out[0]?.statements).toEqual([
      'CREATE TABLE users(id INTEGER);',
      "INSERT INTO users(name) VALUES ('O''Reilly');",
    ]);

    // Second migration uses padded name
    expect(writes[1]?.path).toMatch(/0001_create_posts_table\.sql$/);
    expect(out[1]?.statements).toEqual([
      'UPDATE posts SET a=1;',
      'DELETE FROM posts WHERE id=123;',
    ]);
  });

  it('throws when parameter count does not match placeholders', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: () => ['bad.ts'],
      },
    }));
    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: {
        load: async () => ({
          name: 'bad_migration',
          up: async (db: any) => {
            await db.query('INSERT INTO t(a,b) VALUES (?,?)', ['a']);
          },
        }),
      },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    await expect(
      D1SqlMigrations.compileAndWrite({
        projectRoot: '/repo',
        globalDir: 'global',
        extension: '.ts',
        outputDir: '/out-exists',
      })
    ).rejects.toThrow();
  });

  it('throws when migration uses QueryBuilder (db.table)', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: () => ['qb.ts'],
      },
    }));
    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: {
        load: async () => ({
          name: 'qb_migration',
          up: async (db: any) => {
            await db.table('users').insert({ name: 'foo' });
          },
        }),
      },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    await expect(
      D1SqlMigrations.compileAndWrite({
        projectRoot: '/repo',
        globalDir: 'global',
        extension: '.ts',
        outputDir: '/out',
      })
    ).rejects.toThrow(/D1 SQL compilation does not support QueryBuilder/);
  });

  it('resolves service directory and respects includeGlobal=false', async () => {
    const listedDirs: string[] = [];
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: (dir: string) => {
          listedDirs.push(dir);
          return [];
        },
      },
    }));
    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: { load: async () => ({}) },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    await D1SqlMigrations.compileAndWrite({
      projectRoot: '/repo',
      globalDir: 'global-migrations',
      extension: '.ts',
      outputDir: '/out',
      includeGlobal: false,
      service: 'auth',
    });

    expect(listedDirs).not.toContain('global-migrations');
    expect(listedDirs.some((d) => d.includes('services/auth/database/migrations'))).toBe(true);
  });

  it('executes transactions/queryOne and supports db helpers', async () => {
    const executed: string[] = [];
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: () => ['helper.ts'],
      },
    }));
    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: {
        load: async () => ({
          name: 'helper_migration',
          up: async (db: any) => {
            if (db.isConnected()) executed.push('connected');
            await db.transaction(async (tx: any) => {
              await tx.query('INSERT INTO logs VALUES(1)');
            });
            await db.queryOne('SELECT 1'); // Should be captured as comment/ignored if non-mutating? Or captured? The mock impl captures everything.
            // Check no-ops
            db.onBeforeQuery();
            db.onAfterQuery();
            db.offBeforeQuery();
            db.offAfterQuery();
            db.dispose();
            db.getConfig();
            db.getType();

            // Check adapter methods (createNoopAdapter coverage)
            const adapter = db.getAdapterInstance();
            await adapter.connect();
            await adapter.disconnect();
            await adapter.query('SELECT 1');
            await adapter.queryOne('SELECT 1');
            await adapter.ping();
            await adapter.transaction(async (tx: any) => tx);
            await adapter.rawQuery('SELECT 1');
            adapter.getType();
            adapter.isConnected();
            adapter.getPlaceholder();
          },
        }),
      },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    const out = await D1SqlMigrations.compileAndWrite({
      projectRoot: '/repo',
      globalDir: 'global',
      extension: '.ts',
      outputDir: '/out',
    });

    expect(executed).toContain('connected');
    expect(out[0]?.statements).toContain('INSERT INTO logs VALUES(1);');
  });

  it('throws if params provided but no placeholders', async () => {
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: () => ['p.ts'],
      },
    }));
    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: {
        load: async () => ({
          name: 'param_mismatch',
          up: async (db: any) => {
            // Trigger interpolateSql with no placeholders -> match returns null -> ?? [] used
            // Also triggers throw
            await db.query('SELECT 1', ['param']);
          },
        }),
      },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    await expect(
      D1SqlMigrations.compileAndWrite({
        projectRoot: '/',
        globalDir: 'g',
        extension: 'ts',
        outputDir: 'o',
      })
    ).rejects.toThrow(/Cannot compile parameterized SQL/);
  });

  it('writes empty body for non-mutating migrations', async () => {
    const writes: Array<{ content: string }> = [];
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      mkdirSync: vi.fn(),
      writeFileSync: (p: string, c: string) => writes.push({ content: c }),
    }));
    vi.doMock('@node-singletons/path', async () => await import('node:path'));
    vi.doMock('@/migrations/MigrationDiscovery', () => ({
      MigrationDiscovery: {
        resolveDir: (_root: string, rel: string) => rel,
        listMigrationFiles: () => ['readonly.ts'],
      },
    }));
    vi.doMock('@/migrations/MigrationLoader', () => ({
      MigrationLoader: {
        load: async () => ({
          name: 'readonly_mig',
          up: async (db: any) => {
            await db.query('SELECT 1'); // Non-mutating
          },
        }),
      },
    }));

    const { D1SqlMigrations } = await import('../../../../src/cli/d1/D1SqlMigrations');

    await D1SqlMigrations.compileAndWrite({
      projectRoot: '/',
      globalDir: 'g',
      extension: 'ts',
      outputDir: 'o',
    });

    expect(writes[0].content).toContain('-- Generated from readonly_mig');
    expect(writes[0].content.trim().split('\n').length).toBe(1); // Only header
  });
});
