/**
 * Registers the global post-enqueue hook that core `Queue.enqueue` invokes after a
 * successful enqueue. Every enqueue then wakes the worker runtime (PING), so jobs are
 * drained promptly instead of waiting for the next cron tick. `triggerWorkerPing` is itself
 * gated (WORKER_ENABLED + Redis RPC configured) and honours `WAIT_FOR_PING`.
 */
import type { AppWorkerDefinition } from '@worker-runtime/drain';
import { triggerWorkerPing } from '@worker-runtime/ping';
import type { WorkerModule } from '@worker-runtime/processor-registry';

declare global {
  var __zintrustQueueEnqueueHook:
    | ((queue: string, jobId: unknown, driver: string) => unknown)
    | undefined;
}

/**
 * Wire the app's bundled worker manifest and processor modules into the post-enqueue PING so
 * the same-isolate drain loop can resolve which queues to drain and which processor to run.
 */
export const installQueueEnqueuePingHook = (
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): void => {
  globalThis.__zintrustQueueEnqueueHook = async () =>
    triggerWorkerPing(appWorkerDefinitions, workerModules);
};
