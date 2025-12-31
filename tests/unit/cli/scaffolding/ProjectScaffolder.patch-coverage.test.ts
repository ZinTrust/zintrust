import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ProjectScaffolder patch coverage', () => {
  it('getTemplate returns the in-memory fallback when disk template is unavailable', async () => {
    vi.resetModules();

    const existsSync = vi.fn();
    existsSync.mockReturnValue(false);
    const readFileSync = vi.fn();
    readFileSync.mockReturnValue('');
    const readdirSync = vi.fn();
    readdirSync.mockReturnValue([]);
    const statSync = vi.fn();
    statSync.mockReturnValue({ isDirectory: () => false, isFile: () => false });

    // Force `loadTemplateFromDisk()` to return undefined by making existsSync fail.
    vi.doMock('@node-singletons/fs', () => ({
      default: {
        existsSync,
        readFileSync,
        readdirSync,
        statSync,
      },
    }));

    const mod = await import('@/cli/scaffolding/ProjectScaffolder');

    const tpl = mod.getTemplate('basic');
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe('basic');
  });

  it('prepareContext falls back to coreVersion 0.0.0 when package.json cannot be read', async () => {
    vi.resetModules();

    vi.doMock('@node-singletons/fs', async () => {
      const actual = await vi.importActual<any>('@node-singletons/fs');
      return {
        default: {
          ...actual.default,
          readFileSync: (p: any, enc: any) => {
            const s = String(p);
            if (s.includes('package.json')) {
              throw Object.assign(new Error('read blocked'), { code: 'EACCES' });
            }
            return actual.default.readFileSync(p, enc);
          },
        },
      };
    });

    const { ProjectScaffolder } = await import('@/cli/scaffolding/ProjectScaffolder');

    const scaffolder = ProjectScaffolder.create(process.cwd());
    scaffolder.prepareContext({ name: 'tmp-app' });
    const vars = scaffolder.getVariables();

    expect(vars.coreVersion).toBe('0.0.0');
  });

  it('skips template file when fs.readFileSync throws ENOENT (race-safe)', async () => {
    vi.resetModules();

    vi.doMock('@node-singletons/fs', async () => {
      const actual = await vi.importActual<any>('@node-singletons/fs');
      return {
        default: {
          ...actual.default,
          readFileSync: (p: any, enc: any) => {
            const s = String(p).replaceAll('\\', '/');
            if (s.endsWith('/config/broadcast.ts.tpl')) {
              throw Object.assign(new Error('missing'), { code: 'ENOENT' });
            }
            return actual.default.readFileSync(p, enc);
          },
        },
      };
    });

    const { getTemplate } = await import('@/cli/scaffolding/ProjectScaffolder');
    const tpl = getTemplate('basic');
    expect(tpl).toBeDefined();

    // The missing file should be skipped rather than crashing.
    expect(tpl?.files['config/broadcast.ts']).toBeUndefined();
  });

  it('rethrows fs.readFileSync errors that are not ENOENT', async () => {
    vi.resetModules();

    vi.doMock('@node-singletons/fs', async () => {
      const actual = await vi.importActual<any>('@node-singletons/fs');
      return {
        default: {
          ...actual.default,
          readFileSync: (p: any, enc: any) => {
            const s = String(p).replaceAll('\\', '/');
            if (s.includes('/src/templates/project/basic/') && s.endsWith('/.env.tpl')) {
              throw Object.assign(new Error('read blocked'), { code: 'EACCES' });
            }
            return actual.default.readFileSync(p, enc);
          },
        },
      };
    });

    const { getTemplate } = await import('@/cli/scaffolding/ProjectScaffolder');

    expect(() => getTemplate('basic')).toThrow(/read blocked/);
  });
});
