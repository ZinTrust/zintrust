import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ImportResult =
  | { ok: true; loadedPath: string }
  | { ok: false; reason: 'not-found' | 'import-failed'; errorMessage?: string };

const loadRun = async (
  args: string[],
  results?: { official?: ImportResult; project?: ImportResult }
) => {
  vi.resetModules();

  process.argv = ['node', 'bin/zin.ts', ...args];

  const warn = vi.fn();
  const debug = vi.fn();
  const error = vi.fn();
  const cliRun = vi.fn(async () => undefined);
  const loadForArgs = vi.fn(async () => []);
  const findMissingExtensionForArgs = vi.fn(() => undefined);
  const tryImportRuntimeAutoImports = vi.fn(async () => ({
    ok: false as const,
    reason: 'import-failed' as const,
    errorMessage: 'Loaded 0/4 official plugin imports | failed: @zintrust/socket/register',
    ...results?.official,
  }));
  const tryImportProjectAutoImports = vi.fn(async () => ({
    ok: false as const,
    reason: 'import-failed' as const,
    errorMessage: 'Project plugin register import failed',
    ...results?.project,
  }));

  vi.doMock('@config/logger', () => ({
    Logger: { warn, debug, error },
  }));
  vi.doMock('@cli/utils/EnvFileLoader', () => ({
    EnvFileLoader: { ensureLoaded: vi.fn() },
  }));
  vi.doMock('@cli/OptionalCliExtensions', () => ({
    OptionalCliExtensions: {
      loadForArgs,
      findMissingExtensionForArgs,
    },
  }));
  vi.doMock('@runtime/PluginAutoImports', () => ({
    PluginAutoImports: {
      tryImportRuntimeAutoImports,
      tryImportProjectAutoImports,
    },
  }));
  vi.doMock('@cli/CLI', () => ({
    CLI: {
      create: () => ({ run: cliRun }),
    },
  }));

  const module = await import('../../../bin/zintrust-main');
  return {
    run: module.run,
    warn,
    debug,
    error,
    cliRun,
    loadForArgs,
    findMissingExtensionForArgs,
    tryImportRuntimeAutoImports,
    tryImportProjectAutoImports,
  };
};

describe('zintrust-main plugin auto-import warnings', () => {
  const originalArgv = process.argv.slice();

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.argv = originalArgv.slice();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.argv = originalArgv.slice();
  });

  it('defers plugin auto-import warnings for start commands', async () => {
    const loaded = await loadRun(['start']);

    await loaded.run();

    expect(loaded.tryImportRuntimeAutoImports).toHaveBeenCalledWith('base');
    expect(loaded.tryImportProjectAutoImports).toHaveBeenCalledTimes(1);
    expect(loaded.warn).not.toHaveBeenCalledWith(
      'Official plugin auto-imports failed:',
      expect.anything()
    );
    expect(loaded.warn).not.toHaveBeenCalledWith(
      'Project plugin auto-imports failed:',
      expect.anything()
    );
    expect(loaded.debug).toHaveBeenCalledWith(
      'Official plugin auto-import advisory deferred to runtime bootstrap',
      {
        details: 'Loaded 0/4 official plugin imports | failed: @zintrust/socket/register',
      }
    );
    expect(loaded.debug).toHaveBeenCalledWith(
      'Project plugin auto-import advisory deferred to runtime bootstrap',
      {
        details: 'Project plugin register import failed',
      }
    );
    expect(loaded.cliRun).toHaveBeenCalledWith(['start']);
  });

  it('keeps plugin auto-import warnings for non-start commands', async () => {
    const loaded = await loadRun(['routes']);

    await loaded.run();

    expect(loaded.warn).toHaveBeenCalledWith(
      'Official plugin auto-imports failed:',
      'Loaded 0/4 official plugin imports | failed: @zintrust/socket/register'
    );
    expect(loaded.warn).toHaveBeenCalledWith(
      'Project plugin auto-imports failed:',
      'Project plugin register import failed'
    );
    expect(loaded.cliRun).toHaveBeenCalledWith(['routes']);
  });
});

describe('zintrust-main local CLI handoff helpers', () => {
  const tempPaths: string[] = [];

  const createLocalCliFixture = (): {
    projectRoot: string;
    workDir: string;
    packageRoot: string;
  } => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'zintrust-cli-handoff-'));
    const packageRoot = join(projectRoot, 'node_modules', '@zintrust', 'core');
    const binDir = join(packageRoot, 'bin');
    const workDir = join(projectRoot, 'nested', 'deeper');

    mkdirSync(binDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      '{"name":"@zintrust/core","version":"0.4.76"}'
    );
    writeFileSync(join(binDir, 'zin.js'), 'console.log("fixture");\n');

    tempPaths.push(projectRoot);

    return { projectRoot, workDir, packageRoot };
  };

  afterEach(() => {
    while (tempPaths.length > 0) {
      const target = tempPaths.pop();
      if (target !== undefined) {
        rmSync(target, { recursive: true, force: true });
      }
    }
  });

  it('finds the nearest project-local zin install above the working directory', async () => {
    vi.resetModules();

    const { CliLauncherInternal } = await import('../../../bin/zintrust-main');
    const fixture = createLocalCliFixture();
    const target = CliLauncherInternal.findProjectLocalCliTarget(fixture.workDir);

    expect(target).toBeDefined();
    expect(target?.packageRoot).toBe(fixture.packageRoot);
    expect(target?.binPath).toBe(join(fixture.packageRoot, 'bin', 'zin.js'));
  });

  it('does not hand off when already running from the same package root', async () => {
    vi.resetModules();

    const { CliLauncherInternal } = await import('../../../bin/zintrust-main');
    const currentPackageRoot = CliLauncherInternal.getCurrentPackageRoot();

    expect(
      CliLauncherInternal.resolveProjectLocalCliHandoff(process.cwd(), currentPackageRoot, {
        ...process.env,
        ZINTRUST_CLI_HANDOFF: undefined,
      })
    ).toBeUndefined();
  });

  it('does not hand off when the working directory is already inside the active package root', async () => {
    vi.resetModules();

    const { CliLauncherInternal } = await import('../../../bin/zintrust-main');

    expect(
      CliLauncherInternal.resolveProjectLocalCliHandoff(
        '/opt/homebrew/var/www/Sites/zintrust/tests/unit',
        '/opt/homebrew/var/www/Sites/zintrust'
      )
    ).toBeUndefined();
  });

  it('hands off when a different project-local install exists and no handoff guard is set', async () => {
    vi.resetModules();

    const { CliLauncherInternal } = await import('../../../bin/zintrust-main');
    const fixture = createLocalCliFixture();
    const target = CliLauncherInternal.resolveProjectLocalCliHandoff(
      fixture.workDir,
      '/tmp/global-zintrust-package',
      {
        ...process.env,
        ZINTRUST_CLI_HANDOFF: undefined,
      }
    );

    expect(target).toBeDefined();
    expect(target?.packageRoot).toBe(fixture.packageRoot);
  });

  it('does not hand off when the guard env var is already set', async () => {
    vi.resetModules();

    const { CliLauncherInternal } = await import('../../../bin/zintrust-main');
    const fixture = createLocalCliFixture();

    expect(
      CliLauncherInternal.resolveProjectLocalCliHandoff(
        fixture.workDir,
        '/tmp/global-zintrust-package',
        {
          ...process.env,
          [CliLauncherInternal.CLI_HANDOFF_ENV_KEY]: '1',
        }
      )
    ).toBeUndefined();
  });

  it('waits for the handed-off local CLI child to close before exiting', async () => {
    vi.resetModules();

    const fixture = createLocalCliFixture();
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      once: EventEmitter['once'];
    };
    child.kill = vi.fn(() => true);

    const spawnMock = vi.fn(() => child);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null
    ) => {
      throw new Error(`EXIT:${String(code)}`);
    }) as never);

    vi.doMock('node:child_process', () => ({
      spawn: spawnMock,
    }));

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(fixture.workDir);
    const { CliLauncherInternal } = await import('../../../bin/zintrust-main');
    const pending = CliLauncherInternal.maybeHandoffToProjectLocalCli(['s']);
    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [join(fixture.packageRoot, 'bin', 'zin.js'), 's'],
      expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({ ZINTRUST_CLI_HANDOFF: '1' }),
      })
    );
    expect(exitSpy).not.toHaveBeenCalled();

    child.emit('close', 0, null);

    await expect(pending).rejects.toThrow('EXIT:0');

    cwdSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
