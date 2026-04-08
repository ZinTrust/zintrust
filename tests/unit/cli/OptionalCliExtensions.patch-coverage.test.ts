import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fileURLToPath, pathToFileURL } from '@node-singletons/url';

type OptionalCliExtensionsModule = typeof import('@cli/OptionalCliExtensions');

const successFixture = fileURLToPath(
  new URL('../../fixtures/cli/optional-extension-success.mjs', import.meta.url)
);
const failureFixture = fileURLToPath(
  new URL('../../fixtures/cli/optional-extension-failure.mjs', import.meta.url)
);

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

  it('returns local-fallback when local candidates load after project and package imports fail', async () => {
    const { OptionalCliExtensionsInternal } = await loadExtensionsModule({
      projectResolve: failureFixture,
      localCandidatesExist: true,
    });

    const status = await OptionalCliExtensionsInternal.tryImportExtension({
      packageName: '@zintrust/example-local-fallback',
      specifier: pathToFileURL(failureFixture).href,
      commands: ['example:local-fallback'],
      installCommand: 'npm install @zintrust/example-local-fallback',
      localCandidates: [successFixture],
    });

    expect(status.loaded).toBe(true);
    expect(status.source).toBe('local-fallback');
  });

  it('maps package-root local candidates into the active project root', async () => {
    const projectRoot = '/tmp/zintrust-project';
    const { OptionalCliExtensionsInternal } = await loadExtensionsModule({
      envValue: projectRoot,
    });

    const candidate = path.join(
      originalProcess.cwd(),
      'packages',
      'd1-migrator',
      'src',
      'register.ts'
    );

    expect(
      OptionalCliExtensionsInternal.getProjectLocalCandidates({
        packageName: '@zintrust/example-project-root',
        specifier: '@zintrust/example-project-root/register',
        commands: ['example:project-root'],
        installCommand: 'npm install @zintrust/example-project-root',
        localCandidates: [candidate],
      })
    ).toContain(path.join(projectRoot, 'packages', 'd1-migrator', 'src', 'register.ts'));
  });

  it('skips optional extension loading for unrelated commands', async () => {
    const { OptionalCliExtensions } = await loadExtensionsModule({
      projectResolve: successFixture,
      localCandidatesExist: false,
    });

    await expect(OptionalCliExtensions.loadForArgs(['start'])).resolves.toEqual([]);
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

  it('worker register syncs commands into an already-imported core registry', async () => {
    const { OptionalCliCommandRegistry } = await import('@cli/OptionalCliCommandRegistry');

    expect(OptionalCliCommandRegistry.has('worker:list')).toBe(false);

    (
      globalThis as { __zintrust_cli_command_registry__?: Map<string, unknown> }
    ).__zintrust_cli_command_registry__ = new Map<string, unknown>();

    await import('../../../packages/workers/src/register');

    expect(OptionalCliCommandRegistry.has('worker:list')).toBe(true);
    expect(OptionalCliCommandRegistry.has('worker:doctor')).toBe(true);
    expect(OptionalCliCommandRegistry.has('worker:summary')).toBe(true);
  });

  it('trace register syncs commands into an already-imported core registry', async () => {
    const { OptionalCliCommandRegistry } = await import('@cli/OptionalCliCommandRegistry');

    expect(OptionalCliCommandRegistry.has('trace:status')).toBe(false);

    (
      globalThis as { __zintrust_cli_command_registry__?: Map<string, unknown> }
    ).__zintrust_cli_command_registry__ = new Map<string, unknown>();

    await import('../../../packages/trace/src/cli-register.js');

    expect(OptionalCliCommandRegistry.has('trace:prune')).toBe(true);
    expect(OptionalCliCommandRegistry.has('trace:clear')).toBe(true);
    expect(OptionalCliCommandRegistry.has('trace:status')).toBe(true);
    expect(OptionalCliCommandRegistry.has('migrate:trace')).toBe(true);
  });
});
