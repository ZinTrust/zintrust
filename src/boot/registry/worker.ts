import { appConfig } from '@/config/app';
import { Env } from '@config/env';
import type { IShutdownManager } from '@registry/type';
import { loadWorkersModule } from '@runtime/WorkersModule';

/**
 * Helper: Register Worker management system shutdown hook
 */
export const registerWorkerShutdownHook = async (
  shutdownManager: IShutdownManager
): Promise<void> => {
  if (
    Env.getBool('WORKER_SHUTDOWN_ON_APP_EXIT', true) === false ||
    appConfig.dockerWorker === true
  ) {
    return Promise.resolve();
  }
  // Ensure worker management system is asked to shutdown BEFORE databases are reset.
  // This prevents workers from trying to access DB connections that have already
  // been closed by subsequent shutdown hooks.
  shutdownManager.add(async () => {
    try {
      const mod = (await loadWorkersModule()) as {
        WorkerShutdown: {
          shutdown: (opts: {
            signal?: string;
            timeout?: number;
            forceExit?: boolean;
          }) => Promise<void>;
          isShuttingDown?: () => boolean;
          getShutdownState?: () => { isShuttingDown?: boolean; completedAt?: Date | null };
        };
      };

      const isShuttingDown =
        typeof mod.WorkerShutdown.isShuttingDown === 'function'
          ? mod.WorkerShutdown.isShuttingDown()
          : (mod.WorkerShutdown.getShutdownState?.().isShuttingDown ?? false);
      const completedAt = mod.WorkerShutdown.getShutdownState?.().completedAt ?? null;

      if (isShuttingDown || completedAt !== null) return;

      await mod.WorkerShutdown.shutdown({
        signal: 'APP_SHUTDOWN',
        timeout: 5000,
        forceExit: false,
      });
    } catch {
      /* ignore import failures in restrictive runtimes */
    }
  });
  return Promise.resolve(); // NOSONAR
};
