/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type TempProject = {
  dir: string;
  dispose: () => Promise<void>;
};

const createTempProject = async (files: Record<string, string>): Promise<TempProject> => {
  const dir = await mkdtemp(join(tmpdir(), 'zintrust-env-'));

  await Promise.all(
    Object.entries(files).map(async ([filename, content]) => {
      await writeFile(join(dir, filename), content, 'utf-8');
    })
  );

  return {
    dir,
    dispose: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
};

const snapshotEnv = (): NodeJS.ProcessEnv => ({ ...process.env });

const restoreEnv = (original: NodeJS.ProcessEnv): void => {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }

  for (const [key, value] of Object.entries(original)) {
    if (typeof value === 'string') process.env[key] = value;
    else delete process.env[key];
  }
};

describe('EnvFileLoader', () => {
  const originalCwd = process.cwd();
  const originalEnv = snapshotEnv();

  afterEach(async () => {
    process.chdir(originalCwd);
    restoreEnv(originalEnv);
    vi.resetModules();
  });

  it('.env overrides existing OS env (overrideExisting=true)', async () => {
    const project = await createTempProject({
      '.env': ['APP_MODE=dev', 'APP_PORT=3003', 'FOO=from_env'].join('\n'),
    });

    delete process.env['NODE_ENV'];
    process.env['FOO'] = 'from_os';

    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.load({ overrideExisting: true });

    expect(state.mode).toBe('dev');
    expect(process.env['FOO']).toBe('from_env');
    expect(process.env['APP_PORT']).toBe('3003');
    expect(process.env['PORT']).toBe('3003');
    expect(process.env['NODE_ENV']).toBe('development');

    await project.dispose();
  });

  it('overlays never override base .env values (but may fill missing)', async () => {
    const project = await createTempProject({
      '.env': ['APP_MODE=dev', 'FOO=base'].join('\n'),
      '.env.dev': ['FOO=overlay', 'BAR=from_overlay'].join('\n'),
    });

    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.load({ overrideExisting: true });

    expect(state.mode).toBe('dev');
    expect(process.env['FOO']).toBe('base');
    expect(process.env['BAR']).toBe('from_overlay');

    await project.dispose();
  });

  it('production mode uses .env and does not load .env.production', async () => {
    const project = await createTempProject({
      '.env': ['APP_MODE=prod', 'FOO=base'].join('\n'),
      '.env.production': ['FOO=should_not_apply'].join('\n'),
    });

    delete process.env['NODE_ENV'];
    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.load({ overrideExisting: true });

    expect(state.mode).toBe('production');
    expect(state.loadedFiles).toContain('.env');
    expect(state.loadedFiles).not.toContain('.env.production');
    expect(process.env['FOO']).toBe('base');
    expect(process.env['NODE_ENV']).toBe('production');

    await project.dispose();
  });

  it('unknown APP_MODE values normalize to dev and load .env.dev', async () => {
    const project = await createTempProject({
      '.env': ['APP_MODE=staging', 'FOO=base'].join('\n'),
      '.env.dev': ['BAR=from_env_dev'].join('\n'),
    });

    delete process.env['NODE_ENV'];
    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.load({ overrideExisting: true });

    expect(state.mode).toBe('dev');
    expect(process.env['FOO']).toBe('base');
    expect(process.env['BAR']).toBe('from_env_dev');
    expect(process.env['NODE_ENV']).toBe('development');

    await project.dispose();
  });

  it('CLI overrides win over .env (port, NODE_ENV, runtime)', async () => {
    const project = await createTempProject({
      '.env': ['APP_MODE=dev', 'APP_PORT=3003', 'FOO=from_env'].join('\n'),
    });

    process.env['FOO'] = 'from_os';

    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');

    EnvFileLoader.applyCliOverrides({ port: 3012, nodeEnv: 'production', runtime: 'node' });

    expect(process.env['FOO']).toBe('from_env');
    expect(process.env['PORT']).toBe('3012');
    expect(process.env['APP_PORT']).toBe('3012');
    expect(process.env['NODE_ENV']).toBe('production');
    expect(process.env['RUNTIME']).toBe('node');

    await project.dispose();
  });

  it('handles inline comments and quotes correctly', async () => {
    const project = await createTempProject({
      '.env': [
        'VAR1=value # comment',
        'VAR2="quoted value" # comment',
        "VAR3='single quoted'",
        'VAR4=value#notcomment',
        'VAR5=value\t#tab comment',
        'VAR6=#start comment',
      ].join('\n'),
    });

    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    EnvFileLoader.load();

    expect(process.env['VAR1']).toBe('value');
    expect(process.env['VAR2']).toBe('quoted value');
    expect(process.env['VAR3']).toBe('single quoted');
    expect(process.env['VAR4']).toBe('value#notcomment');
    expect(process.env['VAR5']).toBe('value');
    expect(process.env['VAR6']).toBe('');

    await project.dispose();
  });

  it('handles edge cases in parsing', async () => {
    const project = await createTempProject({
      '.env': [
        'export KEY=val',
        '   ',
        '# just a comment',
        'INVALID_LINE',
        '=no_key',
        'EMPTY_KEY=',
      ].join('\n'),
    });

    process.chdir(project.dir);
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    EnvFileLoader.load();

    expect(process.env['KEY']).toBe('val');
    expect(process.env['EMPTY_KEY']).toBe('');

    await project.dispose();
  });

  it('handles APP_MODE from process.env', async () => {
    const project = await createTempProject({ '.env': '' });
    process.chdir(project.dir);
    delete process.env['NODE_ENV'];
    process.env['APP_MODE'] = 'production';
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.load();

    expect(state.mode).toBe('production');
    expect(process.env['NODE_ENV']).toBe('production');

    await project.dispose();
  });

  it('handles missing .env files gracefully', async () => {
    const project = await createTempProject({});
    process.chdir(project.dir);
    delete process.env['APP_MODE'];
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.load();

    expect(state.loadedFiles).toEqual([]);
    expect(state.mode).toBeUndefined();

    await project.dispose();
  });

  it('syncs PORT and APP_PORT in applyCliOverrides', async () => {
    const project = await createTempProject({});
    process.chdir(project.dir);
    delete process.env['APP_MODE'];
    delete process.env['PORT'];
    delete (process.env as any)['APP_PORT'];
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');

    process.env['PORT'] = '4000';
    EnvFileLoader.applyCliOverrides({});
    expect(process.env['APP_PORT']).toBe('4000');

    delete process.env['PORT'];
    delete (process.env as any)['APP_PORT'];
    process.env['APP_PORT'] = '5000';
    EnvFileLoader.applyCliOverrides({});
    expect(process.env['PORT']).toBe('5000');

    await project.dispose();
  });

  it('covers remaining branches in EnvFileLoader', async () => {
    const project = await createTempProject({
      '.env': 'KEY=val\n=invalid\n \n',
      '.env.local': 'LOCAL=true',
      '.env.dev.local': 'DEV_LOCAL=true',
    });
    process.chdir(project.dir);
    delete process.env['APP_MODE'];
    vi.resetModules();

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');

    // Test caching
    const state1 = EnvFileLoader.load();
    const state2 = EnvFileLoader.load();
    expect(state1).toBe(state2);

    expect(process.env['LOCAL']).toBe('true');
    expect(process.env['DEV_LOCAL']).toBeUndefined(); // mode is undefined

    // Test with mode
    vi.resetModules();
    const { EnvFileLoader: EnvFileLoader2 } = await import('@cli/utils/EnvFileLoader');
    process.env['APP_MODE'] = 'dev';
    EnvFileLoader2.load();
    expect(process.env['DEV_LOCAL']).toBe('true');

    await project.dispose();
  });
});
