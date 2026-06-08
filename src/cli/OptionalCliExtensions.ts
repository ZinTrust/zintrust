import { readEnvString } from '@common/ExternalServiceUtils';
import { esmDirname } from '@common/index';
import { Logger } from '@config/logger';
import { existsSync } from '@node-singletons/fs';
import { createRequire } from '@node-singletons/module';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

export type OptionalCliExtension = {
  packageName: string;
  specifier: string;
  commands: string[];
  installCommand: string;
  localCandidates: string[];
};

type OptionalCliExtensionLoadSource = 'project' | 'package' | 'local-fallback' | 'missing';

export type OptionalCliExtensionStatus = Readonly<{
  packageName: string;
  commands: string[];
  installCommand: string;
  loaded: boolean;
  source: OptionalCliExtensionLoadSource;
}>;

type OptionalCliExtensionLoadOptions = Readonly<{
  logFailures?: boolean;
}>;

const __dirname = esmDirname(import.meta.url);
const packageRoot = path.resolve(__dirname, '../..');

const getProjectCwd = (): string => {
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return process.cwd();
  }

  return packageRoot;
};

const findNearestPackageJsonDir = (cwd: string): string | undefined => {
  let current = cwd;

  while (true) {
    if (existsSync(path.join(current, 'package.json'))) return current;

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
};

const resolveProjectRoot = (): string => {
  const configured = readEnvString('ZINTRUST_PROJECT_ROOT').trim();
  if (configured !== '') return configured;

  const cwd = getProjectCwd();
  return findNearestPackageJsonDir(cwd) ?? cwd;
};

const shouldLogFailures = (options?: OptionalCliExtensionLoadOptions): boolean => {
  if (options?.logFailures === true) return true;
  return readEnvString('ZINTRUST_DEBUG_OPTIONAL_CLI_EXTENSIONS').trim() === '1';
};

const debugFailure = (
  message: string,
  meta: Record<string, unknown>,
  options?: OptionalCliExtensionLoadOptions
): void => {
  if (!shouldLogFailures(options)) return;
  Logger.debug(message, meta);
};

const OPTIONAL_CLI_EXTENSIONS: ReadonlyArray<OptionalCliExtension> = Object.freeze([
  {
    packageName: '@zintrust/d1-migrator',
    specifier: '@zintrust/d1-migrator/register',
    commands: ['migrate-to-d1', 'd1:transfer'],
    installCommand: 'npm install @zintrust/d1-migrator',
    localCandidates: [
      path.join(packageRoot, 'packages', 'd1-migrator', 'src', 'register.ts'),
      path.join(packageRoot, 'packages', 'd1-migrator', 'src', 'register.js'),
      path.join(packageRoot, 'packages', 'd1-migrator', 'dist', 'register.js'),
      path.join(packageRoot, 'dist', 'packages', 'd1-migrator', 'src', 'register.js'),
    ],
  },
  {
    packageName: '@zintrust/workers',
    specifier: '@zintrust/workers/register',
    commands: [
      'worker:list',
      'worker:status',
      'worker:start',
      'worker:start-all',
      'worker:stop',
      'worker:restart',
      'worker:doctor',
      'worker:summary',
    ],
    installCommand: 'npm install @zintrust/workers',
    localCandidates: [
      path.join(packageRoot, 'packages', 'workers', 'src', 'register.ts'),
      path.join(packageRoot, 'packages', 'workers', 'src', 'register.js'),
      path.join(packageRoot, 'packages', 'workers', 'dist', 'register.js'),
      path.join(packageRoot, 'dist', 'packages', 'workers', 'src', 'register.js'),
    ],
  },
  {
    packageName: '@zintrust/trace',
    specifier: '@zintrust/trace/cli-register',
    commands: ['trace:prune', 'trace:clear', 'trace:status', 'migrate:trace'],
    installCommand: 'npm install @zintrust/trace',
    localCandidates: [
      path.join(packageRoot, 'packages', 'trace', 'src', 'cli-register.ts'),
      path.join(packageRoot, 'packages', 'trace', 'src', 'cli-register.js'),
      path.join(packageRoot, 'packages', 'trace', 'dist', 'cli-register.js'),
      path.join(packageRoot, 'dist', 'packages', 'trace', 'src', 'cli-register.js'),
    ],
  },
  {
    packageName: '@zintrust/queue-cloudflare',
    specifier: '@zintrust/queue-cloudflare/cli-register',
    commands: ['migrate:queue-cloudflare', 'queue-cloudflare:migrate'],
    installCommand: 'npm install @zintrust/queue-cloudflare',
    localCandidates: [
      path.join(packageRoot, 'packages', 'queue-cloudflare', 'src', 'cli-register.ts'),
      path.join(packageRoot, 'packages', 'queue-cloudflare', 'src', 'cli-register.js'),
      path.join(packageRoot, 'packages', 'queue-cloudflare', 'dist', 'cli-register.js'),
      path.join(packageRoot, 'dist', 'packages', 'queue-cloudflare', 'src', 'cli-register.js'),
    ],
  },
  {
    packageName: '@zintrust/expose',
    specifier: '@zintrust/expose/register',
    commands: ['expose', 'exp'],
    installCommand: 'npm install @zintrust/expose',
    localCandidates: [
      path.join(packageRoot, 'packages', 'expose', 'src', 'register.ts'),
      path.join(packageRoot, 'packages', 'expose', 'src', 'register.js'),
    ],
  },
]);

let installedExtensionsPromise: Promise<OptionalCliExtensionStatus[]> | undefined;

const getProjectLocalCandidates = (entry: OptionalCliExtension): string[] => {
  const projectRoot = resolveProjectRoot();
  if (projectRoot === packageRoot) return [];

  return Array.from(
    new Set(
      entry.localCandidates.flatMap((candidate) => {
        const relativeCandidate = path.relative(packageRoot, candidate);

        if (
          relativeCandidate === '' ||
          relativeCandidate === '.' ||
          relativeCandidate === '..' ||
          relativeCandidate.startsWith(`..${path.sep}`)
        ) {
          return [];
        }

        return [path.join(projectRoot, relativeCandidate)];
      })
    )
  );
};

const getLocalCandidates = (entry: OptionalCliExtension): string[] => {
  return Array.from(new Set([...getProjectLocalCandidates(entry), ...entry.localCandidates]));
};

const resolveProjectInstalledUrl = (
  entry: OptionalCliExtension,
  options?: OptionalCliExtensionLoadOptions
): string | null => {
  try {
    const projectRoot = resolveProjectRoot();
    const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
    const resolved = requireFromProject.resolve(entry.specifier);
    return pathToFileURL(resolved).href;
  } catch (error) {
    debugFailure(
      '[cli] Optional CLI extension not resolved from project root',
      {
        packageName: entry.packageName,
        specifier: entry.specifier,
        projectRoot: resolveProjectRoot(),
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
    return null;
  }
};

const tryImportProjectInstalledPackage = async (
  entry: OptionalCliExtension,
  options?: OptionalCliExtensionLoadOptions
): Promise<boolean> => {
  const resolvedUrl = resolveProjectInstalledUrl(entry, options);
  if (resolvedUrl === null) return false;

  try {
    await import(resolvedUrl);
    Logger.debug('[cli] Loaded optional CLI extension from project install', {
      packageName: entry.packageName,
      resolvedUrl,
    });
    return true;
  } catch (error) {
    debugFailure(
      '[cli] Optional CLI extension project import failed',
      {
        packageName: entry.packageName,
        resolvedUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
    return false;
  }
};

const tryImportLocalCandidate = async (
  entry: OptionalCliExtension,
  options?: OptionalCliExtensionLoadOptions
): Promise<boolean> => {
  const existingCandidates = getLocalCandidates(entry).filter((candidate) => existsSync(candidate));
  if (existingCandidates.length === 0) return false;

  const results = await Promise.all(
    existingCandidates.map(async (candidate) => {
      try {
        await import(pathToFileURL(candidate).href);
        Logger.debug('[cli] Loaded optional CLI extension from local fallback', {
          packageName: entry.packageName,
          candidate,
        });
        return true;
      } catch (error) {
        debugFailure(
          '[cli] Optional CLI extension local fallback failed',
          {
            packageName: entry.packageName,
            candidate,
            error: error instanceof Error ? error.message : String(error),
          },
          options
        );
        return false;
      }
    })
  );

  return results.some(Boolean);
};

const tryImportPackageSpecifier = async (
  entry: OptionalCliExtension,
  options?: OptionalCliExtensionLoadOptions
): Promise<boolean> => {
  try {
    await import(entry.specifier);
    Logger.debug('[cli] Loaded optional CLI extension package', {
      packageName: entry.packageName,
      specifier: entry.specifier,
    });
    return true;
  } catch (error) {
    debugFailure(
      '[cli] Optional CLI extension package not loaded',
      {
        packageName: entry.packageName,
        specifier: entry.specifier,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
    return false;
  }
};

const tryImportExtension = async (
  entry: OptionalCliExtension,
  options?: OptionalCliExtensionLoadOptions
): Promise<OptionalCliExtensionStatus> => {
  if (await tryImportProjectInstalledPackage(entry, options)) {
    return {
      packageName: entry.packageName,
      commands: [...entry.commands],
      installCommand: entry.installCommand,
      loaded: true,
      source: 'project',
    };
  }

  if (await tryImportPackageSpecifier(entry, options)) {
    return {
      packageName: entry.packageName,
      commands: [...entry.commands],
      installCommand: entry.installCommand,
      loaded: true,
      source: 'package',
    };
  }

  if (await tryImportLocalCandidate(entry, options)) {
    return {
      packageName: entry.packageName,
      commands: [...entry.commands],
      installCommand: entry.installCommand,
      loaded: true,
      source: 'local-fallback',
    };
  }

  return {
    packageName: entry.packageName,
    commands: [...entry.commands],
    installCommand: entry.installCommand,
    loaded: false,
    source: 'missing',
  };
};

const loadAllInstalledExtensions = async (): Promise<OptionalCliExtensionStatus[]> => {
  return OPTIONAL_CLI_EXTENSIONS.reduce<Promise<OptionalCliExtensionStatus[]>>(
    async (statusesPromise, entry) => {
      const statuses = await statusesPromise;
      const status = await tryImportExtension(entry, { logFailures: false });
      return [...statuses, status];
    },
    Promise.resolve([])
  );
};

const getRequestedCommand = (args: string[]): string | undefined => {
  if (args.length === 0) return undefined;

  if (args[0] === 'help') {
    return typeof args[1] === 'string' && args[1].trim() !== '' ? args[1].trim() : undefined;
  }

  return typeof args[0] === 'string' && args[0].trim() !== '' ? args[0].trim() : undefined;
};

const findRequestedExtension = (args: string[]): OptionalCliExtension | undefined => {
  const requestedCommand = getRequestedCommand(args);
  if (requestedCommand === undefined) return undefined;

  return OPTIONAL_CLI_EXTENSIONS.find((entry) => entry.commands.includes(requestedCommand));
};

const isRootHelpRequest = (args: string[]): boolean => {
  if (args.length === 0) return true;
  const first = typeof args[0] === 'string' ? args[0].trim() : '';
  if (first === '' || first === '-h' || first === '--help') return true;
  return first === 'help' && getRequestedCommand(args) === undefined;
};

export const OptionalCliExtensions = Object.freeze({
  async tryImportInstalledExtensions(): Promise<OptionalCliExtensionStatus[]> {
    installedExtensionsPromise ??= loadAllInstalledExtensions();
    return installedExtensionsPromise;
  },

  async loadForArgs(args: string[]): Promise<OptionalCliExtensionStatus[]> {
    const requestedExtension = findRequestedExtension(args);

    if (requestedExtension !== undefined) {
      return [await tryImportExtension(requestedExtension, { logFailures: false })];
    }

    if (isRootHelpRequest(args)) {
      return Promise.all(
        OPTIONAL_CLI_EXTENSIONS.map(async (entry) =>
          tryImportExtension(entry, { logFailures: false })
        )
      );
    }

    return [];
  },

  findMissingExtensionForArgs(
    args: string[],
    statuses: ReadonlyArray<OptionalCliExtensionStatus>
  ): OptionalCliExtensionStatus | undefined {
    const requestedCommand = getRequestedCommand(args);
    if (requestedCommand === undefined) return undefined;

    return statuses.find(
      (status) => status.loaded !== true && status.commands.includes(requestedCommand)
    );
  },

  getMissingExtensionMessage(status: OptionalCliExtensionStatus): string {
    const primaryCommand = status.commands[0] ?? status.packageName;
    return [
      `Command "${primaryCommand}" requires optional package "${status.packageName}".`,
      `Install it and try again: ${status.installCommand}`,
    ].join(' ');
  },

  findRequestedExtension,
});

export const OptionalCliExtensionsInternal = Object.freeze({
  loadAllInstalledExtensions,
  getProjectCwd,
  resolveProjectRoot,
  resolveProjectInstalledUrl,
  shouldLogFailures,
  debugFailure,
  tryImportProjectInstalledPackage,
  tryImportLocalCandidate,
  tryImportPackageSpecifier,
  tryImportExtension,
  getRequestedCommand,
  findRequestedExtension,
  isRootHelpRequest,
  getProjectLocalCandidates,
  getLocalCandidates,
});
