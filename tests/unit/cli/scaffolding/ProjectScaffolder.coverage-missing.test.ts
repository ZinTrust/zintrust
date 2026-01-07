import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEMPLATE_FILE_REL = 'src/{{weird}}x.coverage-missing.json.tpl';

describe('ProjectScaffolder missing-line coverage', () => {
  let templateFileAbs: string | undefined;

  afterEach(() => {
    if (templateFileAbs) {
      try {
        rmSync(templateFileAbs, { force: true });
      } catch {
        // ignore
      }
      templateFileAbs = undefined;
    }
  });

  it('covers coreVersion fallback, render fallbacks, config failure, and unknown db env', async () => {
    vi.resetModules();

    // Create a starter template file whose *path* and *content* include variables.
    // This lets us hit:
    // - renderPathVar fallback (non-primitive)
    // - renderContentVar JSON.stringify catch (circular object)
    const templateRoot = path.join(process.cwd(), 'src/templates/project/basic');
    templateFileAbs = path.join(templateRoot, TEMPLATE_FILE_REL);
    writeFileSync(
      templateFileAbs,
      '{"circular": {{circular}}, "core": "{{coreVersion}}"}\n',
      'utf8'
    );

    const actualFsModule =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    const actualFs = actualFsModule.default;

    const realReadFileSync = actualFs.readFileSync.bind(actualFs);
    const realWriteFileSync = actualFs.writeFileSync.bind(actualFs);

    vi.doMock('@node-singletons/fs', async () => {
      const actual =
        await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
      const fsDefault = actual.default;

      return {
        ...actual,
        default: {
          ...fsDefault,
          readFileSync: (file: unknown, options?: unknown) => {
            const raw = typeof file === 'string' ? file : String(file);
            // Only fail for the framework repo's real package.json, not starter templates like package.json.tpl
            if (/package\.json$/.test(raw)) {
              throw new Error('readFileSync boom');
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realReadFileSync(file as any, options as any);
          },
          writeFileSync: (file: unknown, data: unknown, options?: unknown) => {
            const raw = typeof file === 'string' ? file : String(file);
            if (/\.zintrust\.json$/.test(raw)) {
              throw new Error('writeFileSync boom');
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realWriteFileSync(file as any, data as any, options as any);
          },
        },
      };
    });

    const mod = await import('@cli/scaffolding/ProjectScaffolder');

    const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'zintrust-scaffold-cov-'));
    const scaffolder = mod.createProjectScaffolder(tmpBase);

    scaffolder.prepareContext({ name: 'myapp', template: 'basic', database: 'mysql' });

    const vars = scaffolder.getVariables() as Record<string, unknown>;

    // Non-primitive path var -> renderPathVar falls back to ''
    vars['weird'] = { ok: true };

    // Circular object -> JSON.stringify throws -> renderContentVar catch returns ''
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    vars['circular'] = circular;

    // loadCoreVersion catch branch
    expect(vars['coreVersion']).toBe('0.0.0');

    // Exercise file rendering
    // Exercise unknown-db env branch (dbLines default return [])
    // createEnvFile can run before or after createFiles; templates no longer create `.env`.
    expect(scaffolder.createEnvFile()).toBe(true);

    const created = scaffolder.createFiles();
    expect(created).toBeGreaterThan(0);

    // Exercise createProjectConfigFile catch branch
    expect(scaffolder.createConfigFile()).toBe(false);

    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('covers createEnvFile catch (logs + returns false)', async () => {
    vi.resetModules();

    const actualFsModule =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    const realFs = actualFsModule.default;
    const realWriteFileSync = realFs.writeFileSync.bind(realFs);

    vi.doMock('@node-singletons/fs', async () => {
      const actual =
        await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
      const fsDefault = actual.default;

      return {
        ...actual,
        default: {
          ...fsDefault,
          writeFileSync: (file: unknown, data: unknown, options?: unknown) => {
            const raw = typeof file === 'string' ? file : String(file);
            if (raw.endsWith(`${path.sep}.env`)) {
              throw new Error('write env boom');
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realWriteFileSync(file as any, data as any, options as any);
          },
        },
      };
    });

    const mod = await import('@cli/scaffolding/ProjectScaffolder');

    const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'zintrust-scaffold-cov-envfail-'));
    const scaffolder = mod.createProjectScaffolder(tmpBase);
    scaffolder.prepareContext({ name: 'myapp', template: 'basic', database: 'mysql' });

    expect(scaffolder.createEnvFile()).toBe(false);
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('covers template file read ENOENT skip logic', async () => {
    vi.resetModules();

    const templateRoot = path.join(process.cwd(), 'src/templates/project/basic');
    const rel = 'ENOENT-SAMPLE.coverage-missing.txt.tpl';
    const abs = path.join(templateRoot, rel);
    writeFileSync(abs, 'HELLO', 'utf8');

    const actualFsModule =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    const realFs = actualFsModule.default;
    const realReadFileSync = realFs.readFileSync.bind(realFs);

    vi.doMock('@node-singletons/fs', async () => {
      const actual =
        await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
      const fsDefault = actual.default;

      return {
        ...actual,
        default: {
          ...fsDefault,
          readFileSync: (file: unknown, options?: unknown) => {
            const raw = typeof file === 'string' ? file : String(file);
            if (raw.endsWith(`${path.sep}${rel}`)) {
              const err = Object.assign(new Error('enoent'), { code: 'ENOENT' });
              throw err;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realReadFileSync(file as any, options as any);
          },
        },
      };
    });

    try {
      const mod = await import('@cli/scaffolding/ProjectScaffolder');
      const tpl = mod.getTemplate('basic');
      expect(tpl).toBeDefined();
      expect(Object.keys(tpl?.files ?? {})).not.toContain('ENOENT-SAMPLE.coverage-missing.txt');
    } finally {
      rmSync(abs, { force: true });
    }
  });

  it('covers template file read non-ENOENT rethrow', async () => {
    vi.resetModules();

    const templateRoot = path.join(process.cwd(), 'src/templates/project/basic');
    const rel = 'EACCES-SAMPLE.coverage-missing.txt.tpl';
    const abs = path.join(templateRoot, rel);
    writeFileSync(abs, 'HELLO', 'utf8');

    const actualFsModule =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    const realFs = actualFsModule.default;
    const realReadFileSync = realFs.readFileSync.bind(realFs);

    vi.doMock('@node-singletons/fs', async () => {
      const actual =
        await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
      const fsDefault = actual.default;

      return {
        ...actual,
        default: {
          ...fsDefault,
          readFileSync: (file: unknown, options?: unknown) => {
            const raw = typeof file === 'string' ? file : String(file);
            if (raw.endsWith(`${path.sep}${rel}`)) {
              const err = Object.assign(new Error('eacces'), { code: 'EACCES' });
              throw err;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realReadFileSync(file as any, options as any);
          },
        },
      };
    });

    try {
      const mod = await import('@cli/scaffolding/ProjectScaffolder');
      expect(() => mod.getTemplate('basic')).toThrow();
    } finally {
      rmSync(abs, { force: true });
    }
  });

  it('covers README/.gitignore default content branch by forcing template disk-miss', async () => {
    vi.resetModules();

    const actualFsModule =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    const realFs = actualFsModule.default;
    const realExistsSync = realFs.existsSync.bind(realFs);

    vi.doMock('@node-singletons/fs', async () => {
      const actual =
        await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
      const fsDefault = actual.default;

      return {
        ...actual,
        default: {
          ...fsDefault,
          existsSync: (p: unknown) => {
            const raw = typeof p === 'string' ? p : String(p);
            // Force loadTemplateFromDisk('basic') to return undefined, so we fall back
            // to BASIC_TEMPLATE.files = {} and exercise the README/.gitignore defaults.
            if (
              raw.endsWith(`${path.sep}src${path.sep}templates${path.sep}project${path.sep}basic`)
            ) {
              return false;
            }
            if (
              raw.endsWith(
                `${path.sep}src${path.sep}templates${path.sep}project${path.sep}basic${path.sep}template.json`
              )
            ) {
              return false;
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realExistsSync(p as any);
          },
        },
      };
    });

    const mod = await import('@cli/scaffolding/ProjectScaffolder');

    const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'zintrust-scaffold-cov-readme-'));
    const scaffolder = mod.createProjectScaffolder(tmpBase);
    scaffolder.prepareContext({ name: 'myapp', template: 'basic' });

    const created = scaffolder.createFiles();
    expect(created).toBeGreaterThan(0);

    const projectPath = scaffolder.getProjectPath();
    expect(realExistsSync(path.join(projectPath, 'README.md'))).toBe(true);
    expect(realExistsSync(path.join(projectPath, '.gitignore'))).toBe(true);

    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('covers scaffoldProject wrapper', async () => {
    vi.resetModules();

    const mod = await import('@cli/scaffolding/ProjectScaffolder');
    const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'zintrust-scaffold-cov-wrapper-'));

    const result = await mod.scaffoldProject(tmpBase, { name: 'myapp' });
    expect(result.success).toBe(true);

    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('covers scaffoldWithState catch branch when an unexpected error occurs', async () => {
    const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'zintrust-scaffold-cov-catch-'));

    vi.resetModules();

    const actualFsModule =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    const realFs = actualFsModule.default;
    const realMkdirSync = realFs.mkdirSync.bind(realFs);

    vi.doMock('@node-singletons/fs', async () => {
      const actual =
        await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
      const fsDefault = actual.default;

      return {
        ...actual,
        default: {
          ...fsDefault,
          mkdirSync: (p: unknown, options?: unknown) => {
            const raw = typeof p === 'string' ? p : String(p);
            if (raw.startsWith(tmpBase)) {
              throw new Error('mkdir boom');
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return realMkdirSync(p as any, options as any);
          },
        },
      };
    });

    const mod = await import('@cli/scaffolding/ProjectScaffolder');
    const result = await mod.createProjectScaffolder(tmpBase).scaffold({ name: 'myapp' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('mkdir boom');

    rmSync(tmpBase, { recursive: true, force: true });
  });
});
