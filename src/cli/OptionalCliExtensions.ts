import { readEnvString } from '@common/ExternalServiceUtils';
import { esmDirname } from '@common/index';
import { Logger } from '@config/logger';
import { existsSync } from '@node-singletons/fs';
import { createRequire } from '@node-singletons/module';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

type OptionalCliExtension = {
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

const __dirname = esmDirname(import.meta.url);
const packageRoot = path.resolve(__dirname, '../..');

const getProjectCwd = (): string => {
  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return process.cwd();
  }

  return packageRoot;
};

const resolveProjectRoot = (): string => {
  const configured = readEnvString('ZINTRUST_PROJECT_ROOT').trim();
  if (configured !== '') return configured;
  return getProjectCwd();
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
      'worker:summary',
    ],
    installCommand: 'npm install @zintrust/workers',
    localCandidates: [
      path.join(packageRoot, 'packages', 'workers', 'src', 'register.ts'),
      path.join(packageRoot, 'packages', 'workers', 'src', 'register.js'),
      path.join(packageRoot, 'dist', 'packages', 'workers', 'src', 'register.js'),
    ],
  },
]);

const resolveProjectInstalledUrl = (entry: OptionalCliExtension): string | null => {
  try {
    const projectRoot = resolveProjectRoot();
    const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
    const resolved = requireFromProject.resolve(entry.specifier);
    return pathToFileURL(resolved).href;
  } catch (error) {
    Logger.debug('[cli] Optional CLI extension not resolved from project root', {
      packageName: entry.packageName,
      specifier: entry.specifier,
      projectRoot: resolveProjectRoot(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const tryImportProjectInstalledPackage = async (entry: OptionalCliExtension): Promise<boolean> => {
  const resolvedUrl = resolveProjectInstalledUrl(entry);
  if (resolvedUrl === null) return false;

  try {
    await import(resolvedUrl);
    Logger.debug('[cli] Loaded optional CLI extension from project install', {
      packageName: entry.packageName,
      resolvedUrl,
    });
    return true;
  } catch (error) {
    Logger.debug('[cli] Optional CLI extension project import failed', {
      packageName: entry.packageName,
      resolvedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const tryImportLocalCandidate = async (entry: OptionalCliExtension): Promise<boolean> => {
  const existingCandidates = entry.localCandidates.filter((candidate) => existsSync(candidate));
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
        Logger.debug('[cli] Optional CLI extension local fallback failed', {
          packageName: entry.packageName,
          candidate,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    })
  );

  return results.some(Boolean);
};

const tryImportPackageSpecifier = async (entry: OptionalCliExtension): Promise<boolean> => {
  try {
    await import(entry.specifier);
    Logger.debug('[cli] Loaded optional CLI extension package', {
      packageName: entry.packageName,
      specifier: entry.specifier,
    });
    return true;
  } catch (error) {
    Logger.debug('[cli] Optional CLI extension package not loaded', {
      packageName: entry.packageName,
      specifier: entry.specifier,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const tryImportExtension = async (
  entry: OptionalCliExtension
): Promise<OptionalCliExtensionStatus> => {
  if (await tryImportProjectInstalledPackage(entry)) {
    return {
      packageName: entry.packageName,
      commands: [...entry.commands],
      installCommand: entry.installCommand,
      loaded: true,
      source: 'project',
    };
  }

  if (await tryImportPackageSpecifier(entry)) {
    return {
      packageName: entry.packageName,
      commands: [...entry.commands],
      installCommand: entry.installCommand,
      loaded: true,
      source: 'package',
    };
  }

  if (await tryImportLocalCandidate(entry)) {
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

const getRequestedCommand = (args: string[]): string | undefined => {
  if (args.length === 0) return undefined;

  if (args[0] === 'help') {
    return typeof args[1] === 'string' && args[1].trim() !== '' ? args[1].trim() : undefined;
  }

  return typeof args[0] === 'string' && args[0].trim() !== '' ? args[0].trim() : undefined;
};

export const OptionalCliExtensions = Object.freeze({
  async tryImportInstalledExtensions(): Promise<OptionalCliExtensionStatus[]> {
    return Promise.all(OPTIONAL_CLI_EXTENSIONS.map(tryImportExtension));
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
});
