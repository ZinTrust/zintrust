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
});
