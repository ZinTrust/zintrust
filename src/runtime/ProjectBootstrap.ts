import { Logger } from '@config/logger';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

const getProjectRoot = (): string => {
  const fromEnv = process.env?.['ZINTRUST_PROJECT_ROOT'] ?? '';
  if (fromEnv.trim() !== '') return fromEnv.trim();
  return process.cwd();
};

const getBootstrapCandidates = (projectRoot: string): string[] => [
  path.join(projectRoot, 'src', 'boot', 'bootstrap.ts'),
  path.join(projectRoot, 'dist', 'src', 'boot', 'bootstrap.js'),
  path.join(projectRoot, 'src', 'boot', 'bootstrap.js'),
];

const tryImportBootstrapCandidate = async (candidate: string): Promise<boolean> => {
  if (!existsSync(candidate)) return false;

  try {
    await import(pathToFileURL(candidate).href);
    return true;
  } catch (error) {
    Logger.warn('Failed to import project bootstrap candidate', {
      candidate,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export async function loadProjectBootstrap(): Promise<void> {
  const projectRoot = getProjectRoot();

  for (const candidate of getBootstrapCandidates(projectRoot)) {
    // eslint-disable-next-line no-await-in-loop
    const loaded = await tryImportBootstrapCandidate(candidate);
    if (loaded) return;
  }

  await import('@boot/bootstrap');
}

export default Object.freeze({
  loadProjectBootstrap,
});
