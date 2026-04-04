import { isNodeRuntime } from '@runtime/detectRuntime';
import { resolveNodeProjectRoot } from '@runtime/resolveNodeProjectRoot';

type NodeStartupLoadState = {
  loadedFiles: string[];
  mode?: string;
};

type EnsureNodeStartupEnvOptions = {
  entry: string;
  warnOnMissingEnv?: boolean;
};

let pendingNodeStartupEnv: Promise<NodeStartupLoadState | undefined> | undefined;

const warnOnMissingEnvFiles = async (projectRoot: string, entry: string): Promise<void> => {
  const [{ Logger }, { existsSync }, path] = await Promise.all([
    import('@config/logger'),
    import('@node-singletons/fs'),
    import('@node-singletons/path'),
  ]);

  const resolvedDotEnv = path.join(projectRoot, '.env');
  Logger.warn('Node bootstrap started without loaded env files.', {
    projectRoot,
    resolvedDotEnv: existsSync(resolvedDotEnv) ? resolvedDotEnv : 'missing',
    entry,
  });
};

export const ensureNodeStartupEnvLoaded = async (
  options: EnsureNodeStartupEnvOptions
): Promise<NodeStartupLoadState | undefined> => {
  if (!isNodeRuntime()) return undefined;

  pendingNodeStartupEnv ??= (async () => {
    const projectRoot = await resolveNodeProjectRoot();
    if ((process.env?.['ZINTRUST_PROJECT_ROOT'] ?? '').trim() === '') {
      process.env['ZINTRUST_PROJECT_ROOT'] = projectRoot;
    }

    const { EnvFileLoader } = await import('@cli/utils/EnvFileLoader');
    const state = EnvFileLoader.ensureLoaded({
      cwd: projectRoot,
      includeCwd: true,
    });

    if (options.warnOnMissingEnv === true && state.loadedFiles.length === 0) {
      await warnOnMissingEnvFiles(projectRoot, options.entry);
    }

    return state;
  })();

  return pendingNodeStartupEnv;
};

export default Object.freeze({
  ensureNodeStartupEnvLoaded,
});
