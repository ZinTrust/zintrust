import { Logger } from '@config/logger';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';

type ImportResult =
  | { ok: true; loadedPath: string }
  | {
      ok: false;
      loadedPath?: string;
      reason: 'not-found' | 'import-failed';
      errorMessage?: string;
    };

const resolveProjectRoot = (): string => {
  const projectRoot = String(process.env['ZINTRUST_PROJECT_ROOT'] ?? '').trim();
  return projectRoot.length > 0 ? projectRoot : process.cwd();
};

const getCandidates = (projectRoot: string): string[] => {
  return [
    path.join(projectRoot, 'src', 'zintrust.workers.ts'),
    path.join(projectRoot, 'dist', 'src', 'zintrust.workers.js'),
    path.join(projectRoot, 'src', 'zintrust.workers.js'),
  ];
};

const invokeWorkerEntrypoint = async (mod: Record<string, unknown>): Promise<void> => {
  let registerWorkers: (() => void | Promise<void>) | null = null;

  if (typeof mod['registerWorkers'] === 'function') {
    registerWorkers = mod['registerWorkers'] as () => void | Promise<void>;
  } else if (typeof mod['default'] === 'function') {
    registerWorkers = mod['default'] as () => void | Promise<void>;
  }

  if (registerWorkers !== null) {
    await registerWorkers();
  }
};

export const WorkerProjectAutoImports = Object.freeze({
  async tryImportProjectWorkerEntrypoint(): Promise<ImportResult> {
    const candidates = getCandidates(resolveProjectRoot()).filter((candidate) =>
      existsSync(candidate)
    );

    if (candidates.length === 0) {
      return { ok: false, reason: 'not-found' };
    }

    let firstFailure: ImportResult | null = null;

    for (const candidate of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const mod = (await import(pathToFileURL(candidate).href)) as Record<string, unknown>;
        // eslint-disable-next-line no-await-in-loop
        await invokeWorkerEntrypoint(mod);
        return { ok: true, loadedPath: candidate };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.debug('[workers] Project worker entrypoint import failed', {
          candidate,
          errorMessage,
        });

        firstFailure ??= {
          ok: false,
          loadedPath: candidate,
          reason: 'import-failed',
          errorMessage,
        };
      }
    }

    return (
      firstFailure ?? {
        ok: false,
        reason: 'import-failed',
        errorMessage: 'All worker entrypoint candidates failed',
      }
    );
  },
});
