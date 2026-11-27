/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import * as path from 'node:path';
import { fileURLToPath } from '@node-singletons/url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExtensionsModule = typeof import('@cli/OptionalCliExtensions');
type Entry = Parameters<ExtensionsModule['OptionalCliExtensionsInternal']['tryImportExtension']>[0];

const successFixture = fileURLToPath(
  new URL('../../../fixtures/cli/optional-extension-success.mjs', import.meta.url)
);
const failureFixture = fileURLToPath(
  new URL('../../../fixtures/cli/optional-extension-failure.mjs', import.meta.url)
);
const stringThrowSpecifier = 'data:text/javascript,throw%20%22plain%20boom%22';
const packageRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const loggerMock = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

type LoadOptions = {
  projectRoot?: string;
  envValues?: Record<string, string>;
  projectResolve?: string | 'throw-error' | 'throw-string';
  existsSync?: (candidate: string) => boolean;
  identityUrl?: boolean;
};

const loadModule = async (options: LoadOptions = {}): Promise<ExtensionsModule> => {
  vi.resetModules();

  vi.doMock('@common/ExternalServiceUtils', () => ({
    readEnvString: vi.fn((key: string) => options.envValues?.[key] ?? ''),
  }));

  vi.doMock('@config/logger', () => ({ Logger: loggerMock }));

  if (options.identityUrl === true) {
    vi.doMock('@node-singletons/url', async () => {
      const actual = await vi.importActual<typeof import('@node-singletons/url')>(
        '@node-singletons/url'
      );
      return { ...actual, pathToFileURL: (input: string | URL) => ({ href: String(input) }) };
    });
  }

  vi.doMock('@node-singletons/module', () => ({
    createRequire: vi.fn(() => ({
      resolve: vi.fn((specifier: string) => {
        if (options.projectResolve === 'throw-error') {
          throw new Error(`Cannot resolve ${specifier}`);
        }
        if (options.projectResolve === 'throw-string') {
          throw 'plain resolve failure';
        }
        return options.projectResolve ?? successFixture;
      }),
    })),
  }));

  vi.doMock('@node-singletons/fs', async () => {
    const actual = await vi.importActual<typeof import('@node-singletons/fs')>('@node-singletons/fs');
    return {
      ...actual,
      existsSync: vi.fn((candidate: string) => {
        if (typeof options.existsSync === 'function') return options.existsSync(candidate);
        if (candidate.endsWith('package.json')) return true;
        return false;
      }),
    };
  });

  if (typeof options.projectRoot === 'string') {
    vi.stubEnv('ZINTRUST_PROJECT_ROOT', options.projectRoot);
  }

  return import('@cli/OptionalCliExtensions');
};

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  packageName: '@zintrust/example',
  specifier: successFixture,
  commands: ['example:command'],
  installCommand: 'npm install @zintrust/example',
  localCandidates: [],
  ...overrides,
});

describe('OptionalCliExtensions uncovered branches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('logs failures only when explicitly requested or debug env is enabled', async () => {
    const withEnv = await loadModule({
      envValues: { ZINTRUST_DEBUG_OPTIONAL_CLI_EXTENSIONS: '1' },
    });
    const withoutEnv = await loadModule({
      envValues: { ZINTRUST_DEBUG_OPTIONAL_CLI_EXTENSIONS: '0' },
    });
    expect(withEnv.OptionalCliExtensionsInternal.shouldLogFailures()).toBe(true);
    expect(withEnv.OptionalCliExtensionsInternal.shouldLogFailures({})).toBe(true);
    expect(withEnv.OptionalCliExtensionsInternal.shouldLogFailures({ logFailures: true })).toBe(
      true
    );
    expect(
      withoutEnv.OptionalCliExtensionsInternal.shouldLogFailures({ logFailures: false })
    ).toBe(false);
    expect(withoutEnv.OptionalCliExtensionsInternal.shouldLogFailures()).toBe(false);

    withoutEnv.OptionalCliExtensionsInternal.debugFailure('quiet', {});
    expect(loggerMock.debug).not.toHaveBeenCalled();

    withEnv.OptionalCliExtensionsInternal.debugFailure('loud', { reason: 'test' });
    expect(loggerMock.debug).toHaveBeenCalledWith('loud', { reason: 'test' });
  });

  it('skips candidate paths that stay inside, equal, or escape the package root', async () => {
    const projectRoot = '/tmp/zintrust-project';
    const { OptionalCliExtensionsInternal } = await loadModule({
      envValues: { ZINTRUST_PROJECT_ROOT: projectRoot },
    });
    const parentDir = path.dirname(packageRoot);
    const candidates = [
      packageRoot,
      path.join(packageRoot, '.'),
      parentDir,
      path.join(parentDir, 'outside'),
      path.join(packageRoot, 'packages', 'd1-migrator', 'src', 'register.ts'),
    ];

    expect(
      OptionalCliExtensionsInternal.getProjectLocalCandidates(makeEntry({ localCandidates: candidates }))
    ).toEqual([
      path.join(projectRoot, 'packages', 'd1-migrator', 'src', 'register.ts'),
    ]);
  });

  it('normalizes both Error and non-Error project resolution failures', async () => {
    for (const projectResolve of ['throw-error', 'throw-string'] as const) {
      const { OptionalCliExtensionsInternal } = await loadModule({ projectResolve });
      const resolved = OptionalCliExtensionsInternal.resolveProjectInstalledUrl(
        makeEntry(),
        { logFailures: true }
      );

      expect(resolved).toBeNull();
    }

    const messages = loggerMock.debug.mock.calls.map((call) => call[1] as { error: unknown });
    expect(messages.some((meta) => meta.error === 'Cannot resolve ' + successFixture)).toBe(true);
    expect(messages.some((meta) => meta.error === 'plain resolve failure')).toBe(true);
  });

  it('reports project-import failures for Error and non-Error rejections', async () => {
    for (const projectResolve of [failureFixture, stringThrowSpecifier]) {
      const { OptionalCliExtensionsInternal } = await loadModule({ projectResolve });
      await expect(
        OptionalCliExtensionsInternal.tryImportProjectInstalledPackage(makeEntry(), {
          logFailures: true,
        })
      ).resolves.toBe(false);
    }

    const errors = loggerMock.debug.mock.calls.map((call) => (call[1] as { error: unknown }).error);
    expect(errors.some((error) => typeof error === 'string' && error.length > 0)).toBe(true);
  });

  it('returns false early when no local candidates exist', async () => {
    const { OptionalCliExtensionsInternal } = await loadModule({
      existsSync: (candidate) => candidate.endsWith('package.json'),
    });

    await expect(
      OptionalCliExtensionsInternal.tryImportLocalCandidate(
        makeEntry({ localCandidates: [successFixture] }),
        { logFailures: true }
      )
    ).resolves.toBe(false);
  });

  it('reports local fallback import failures for Error and non-Error rejections', async () => {
    const { OptionalCliExtensionsInternal } = await loadModule({
      existsSync: (candidate) => candidate.includes('optional-extension-failure'),
    });

    await expect(
      OptionalCliExtensionsInternal.tryImportLocalCandidate(
        makeEntry({
          localCandidates: [failureFixture, stringThrowSpecifier],
        }),
        { logFailures: true }
      )
    ).resolves.toBe(false);

    const errors = loggerMock.debug.mock.calls.filter((call) => String(call[0]).includes('local fallback failed'))
      .map((call) => (call[1] as { error: unknown }).error);
    expect(errors.some((error) => typeof error === 'string' && error.length > 0)).toBe(true);
  });

  it('reports package specifier import failures for Error and non-Error rejections', async () => {
    const { OptionalCliExtensionsInternal } = await loadModule();

    for (const specifier of [failureFixture, stringThrowSpecifier]) {
      await expect(
        OptionalCliExtensionsInternal.tryImportPackageSpecifier(makeEntry({ specifier }), {
          logFailures: true,
        })
      ).resolves.toBe(false);
    }

    const errors = loggerMock.debug.mock.calls.filter((call) => String(call[0]).includes('package not loaded'))
      .map((call) => (call[1] as { error: unknown }).error);
    expect(errors.some((error) => typeof error === 'string' && error.length > 0)).toBe(true);
  });

  it('normalizes requested commands for empty, help, and non-string arguments', async () => {
    const { OptionalCliExtensionsInternal } = await loadModule();
    const { getRequestedCommand, isRootHelpRequest, findRequestedExtension } =
      OptionalCliExtensionsInternal;

    expect(getRequestedCommand([])).toBeUndefined();
    expect(getRequestedCommand(['help'])).toBeUndefined();
    expect(getRequestedCommand(['help', '  migrate-to-d1  '])).toBe('migrate-to-d1');
    expect(getRequestedCommand(['  worker:list  '])).toBe('worker:list');
    expect(getRequestedCommand(['   '])).toBeUndefined();
    expect(getRequestedCommand([42 as never])).toBeUndefined();

    expect(isRootHelpRequest([])).toBe(true);
    expect(isRootHelpRequest(['-h'])).toBe(true);
    expect(isRootHelpRequest(['--help'])).toBe(true);
    expect(isRootHelpRequest(['help'])).toBe(true);
    expect(isRootHelpRequest(['help', 'migrate-to-d1'])).toBe(false);
    expect(isRootHelpRequest(['start'])).toBe(false);
    expect(isRootHelpRequest([42 as never])).toBe(true);

    expect(findRequestedExtension(['migrate-to-d1'])?.packageName).toBe('@zintrust/d1-migrator');
    expect(findRequestedExtension(['unknown:command'])).toBeUndefined();
    expect(findRequestedExtension([])).toBeUndefined();
  });

  it('covers non-Error import rejections for project and local fallback paths', async () => {
    const { OptionalCliExtensionsInternal } = await loadModule({
      identityUrl: true,
      projectResolve: stringThrowSpecifier,
      existsSync: (candidate) => candidate === stringThrowSpecifier,
    });

    await expect(
      OptionalCliExtensionsInternal.tryImportProjectInstalledPackage(makeEntry(), {
        logFailures: true,
      })
    ).resolves.toBe(false);
    await expect(
      OptionalCliExtensionsInternal.tryImportLocalCandidate(
        makeEntry({ localCandidates: [stringThrowSpecifier] }),
        { logFailures: true }
      )
    ).resolves.toBe(false);
  });

  it('loads only requested extensions, all extensions for root help, and none otherwise', async () => {
    const { OptionalCliExtensions } = await loadModule({
      projectResolve: failureFixture,
      existsSync: (candidate) => candidate.endsWith('package.json'),
    });

    const requested = await OptionalCliExtensions.loadForArgs(['migrate-to-d1']);
    expect(requested).toHaveLength(1);
    expect(requested[0]?.packageName).toBe('@zintrust/d1-migrator');

    const help = await OptionalCliExtensions.loadForArgs(['--help']);
    expect(help).toHaveLength(5);

    expect(await OptionalCliExtensions.loadForArgs(['start'])).toEqual([]);

    expect(
      OptionalCliExtensions.findMissingExtensionForArgs([], [{ loaded: false } as never])
    ).toBeUndefined();
    expect(
      OptionalCliExtensions.getMissingExtensionMessage({
        commands: [],
        packageName: '@zintrust/unnamed',
        installCommand: 'npm install @zintrust/unnamed',
        loaded: false,
        source: 'missing',
      })
    ).toContain('Command "@zintrust/unnamed"');

    await OptionalCliExtensions.tryImportInstalledExtensions();
    const first = await OptionalCliExtensions.tryImportInstalledExtensions();
    expect(first).toHaveLength(5);
  });
});
