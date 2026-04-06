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
