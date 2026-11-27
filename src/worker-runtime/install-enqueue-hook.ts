/**
 * Registers the global post-enqueue hook that core `Queue.enqueue` invokes after a
 * successful enqueue. Every enqueue then wakes the worker runtime (PING), so jobs are
 * drained promptly instead of waiting for the next cron tick. `triggerWorkerPing` is itself
 * gated (WORKER_ENABLED + Redis RPC configured) and honours `WAIT_FOR_PING`.
 */
import type { AppWorkerDefinition } from '@worker-runtime/drain';
import { triggerWorkerPing } from '@worker-runtime/ping';
import type { WorkerModule } from '@worker-runtime/processor-registry';

type QueueEnqueueHookState = {
  definitions: AppWorkerDefinition[];
  modules: ReadonlyArray<WorkerModule>;
};

declare global {
  var __zintrustQueueEnqueueHookState: QueueEnqueueHookState | undefined;
  var __zintrustQueueEnqueueHook:
    | ((queue: string, jobId: unknown, driver: string) => unknown)
    | undefined;
}

// The hook reads worker arrays from a replaceable slot, so reconfiguration does not leave a
// closure pinning the previous manifest/modules.
const pingFromSlot = async (): Promise<void> => {
  const state = globalThis.__zintrustQueueEnqueueHookState;
  if (state === undefined) return;
  await triggerWorkerPing(state.definitions, state.modules);
};

/**
 * Wire the app's bundled worker manifest and processor modules into the post-enqueue PING so
 * the same-isolate drain loop can resolve which queues to drain and which processor to run.
 */
export const installQueueEnqueuePingHook = (
  appWorkerDefinitions: AppWorkerDefinition[],
  workerModules: ReadonlyArray<WorkerModule>
): void => {
  globalThis.__zintrustQueueEnqueueHookState = {
    definitions: appWorkerDefinitions,
    modules: workerModules,
  };
  globalThis.__zintrustQueueEnqueueHook = pingFromSlot;
};

/** Release the hook and the worker arrays it references (e.g. when workers are reconfigured). */
export const uninstallQueueEnqueuePingHook = (): void => {
  globalThis.__zintrustQueueEnqueueHook = undefined;
  globalThis.__zintrustQueueEnqueueHookState = undefined;
};
