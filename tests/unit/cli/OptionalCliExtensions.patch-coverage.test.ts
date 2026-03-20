import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pathToFileURL } from '@node-singletons/url';

type OptionalCliExtensionsModule = typeof import('@cli/OptionalCliExtensions');

const successFixture =
  '/opt/homebrew/var/www/Sites/zintrust/tests/fixtures/cli/optional-extension-success.mjs';
const failureFixture =
  '/opt/homebrew/var/www/Sites/zintrust/tests/fixtures/cli/optional-extension-failure.mjs';

const loadExtensionsModule = async (options?: {
  projectResolve?: string | 'throw';
  localCandidatesExist?: boolean;
  envValue?: string;
}): Promise<OptionalCliExtensionsModule> => {
  vi.resetModules();

  vi.doMock('@common/ExternalServiceUtils', () => ({
    readEnvString: vi.fn(() => options?.envValue ?? ''),
  }));

  vi.doMock('@config/logger', () => ({
    Logger: {
      debug: vi.fn(),
    },
  }));

  vi.doMock('@node-singletons/module', () => ({
    createRequire: vi.fn(() => ({
      resolve: vi.fn((specifier: string) => {
        if (options?.projectResolve === 'throw') {
          throw new Error(`Cannot resolve ${specifier}`);
        }

        return options?.projectResolve ?? successFixture;
      }),
    })),
  }));

  vi.doMock('@node-singletons/fs', async () => {
    const actual =
      await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    return {
      ...actual,
      existsSync: vi.fn(() => options?.localCandidatesExist === true),
    };
  });

  return import('@cli/OptionalCliExtensions');
};

describe('OptionalCliExtensions patch coverage', () => {
  const originalProcess = process;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env['ZINTRUST_PROJECT_ROOT'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to packageRoot when process.cwd is unavailable', async () => {
    const { OptionalCliExtensionsInternal } = await loadExtensionsModule();

    vi.stubGlobal('process', {
      ...originalProcess,
      cwd: undefined,
      env: { ...originalProcess.env },
    });

    expect(OptionalCliExtensionsInternal.getProjectCwd()).toBe(originalProcess.cwd());
  });

  it('returns project source when the project-installed extension import succeeds', async () => {
    const { OptionalCliExtensionsInternal } = await loadExtensionsModule({
      projectResolve: successFixture,
      localCandidatesExist: false,
    });

    const status = await OptionalCliExtensionsInternal.tryImportExtension({
      packageName: '@zintrust/example-project',
      specifier: pathToFileURL(failureFixture).href,
      commands: ['example:project'],
      installCommand: 'npm install @zintrust/example-project',
      localCandidates: [],
    });

    expect(status.loaded).toBe(true);
    expect(status.source).toBe('project');
  });

  it('returns package source when the package specifier import succeeds after project resolution fails', async () => {
    const { OptionalCliExtensionsInternal } = await loadExtensionsModule({
      projectResolve: 'throw',
      localCandidatesExist: false,
    });

    const status = await OptionalCliExtensionsInternal.tryImportExtension({
      packageName: '@zintrust/example-package',
      specifier: pathToFileURL(successFixture).href,
      commands: ['example:package'],
      installCommand: 'npm install @zintrust/example-package',
      localCandidates: [],
    });

    expect(status.loaded).toBe(true);
    expect(status.source).toBe('package');
  });

  it('marks an extension as missing when project, package, and local fallback imports fail', async () => {
    const { OptionalCliExtensions, OptionalCliExtensionsInternal } = await loadExtensionsModule({
      projectResolve: failureFixture,
      localCandidatesExist: true,
    });

    const status = await OptionalCliExtensionsInternal.tryImportExtension({
      packageName: '@zintrust/example-missing',
      specifier: pathToFileURL(failureFixture).href,
      commands: ['example:missing'],
      installCommand: 'npm install @zintrust/example-missing',
      localCandidates: [failureFixture],
    });

    expect(status.loaded).toBe(false);
    expect(status.source).toBe('missing');
    expect(
      OptionalCliExtensions.findMissingExtensionForArgs(['help', ' example:missing '], [status])
    ).toEqual(status);
    expect(OptionalCliExtensions.findMissingExtensionForArgs(['help', '   '], [status])).toBe(
      undefined
    );
  });
});

describe('OptionalCliCommandRegistry patch coverage', () => {
  beforeEach(() => {
    (
      globalThis as { __zintrust_cli_command_registry__?: Map<string, unknown> }
    ).__zintrust_cli_command_registry__ = new Map<string, unknown>();
    vi.resetModules();
  });

  it('gets and checks registered commands using normalized ids', async () => {
    const { OptionalCliCommandRegistry } = await import('@cli/OptionalCliCommandRegistry');

    const provider = {
      getCommand: vi.fn() as unknown as () => import('commander').Command,
    };

    OptionalCliCommandRegistry.register('  worker:list  ', provider);

    expect(OptionalCliCommandRegistry.has('worker:list')).toBe(true);
    expect(OptionalCliCommandRegistry.get(' worker:list ')).toBe(provider);
  });
});
