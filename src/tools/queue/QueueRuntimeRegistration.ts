import type { QueueConfig } from '@config/queue';

import { InMemoryQueue } from '@tools/queue/drivers/InMemory';
import { RedisQueue } from '@tools/queue/drivers/Redis';
import { Queue } from '@tools/queue/Queue';

/**
 * Register queue drivers from runtime config.
 *
 * This follows the framework's config-driven availability pattern:
 * - Built-in drivers are registered so `QUEUE_DRIVER=sync|inmemory|redis` works out of the box.
 * - If the configured default is registered, it is ALSO registered as 'default'.
 * - Unknown/unregistered driver names still throw when selected.
 */
export function registerQueuesFromRuntimeConfig(config: QueueConfig): void {
  // Built-in drivers (core)
  Queue.register('inmemory', InMemoryQueue);
  // Project templates use QUEUE_DRIVER=sync; treat this as an alias of in-memory.
  Queue.register('sync', InMemoryQueue);
  Queue.register('redis', RedisQueue);

  const defaultName = (config.default ?? '').toString().trim().toLowerCase();
  if (defaultName.length === 0) return;

  try {
    const drv = Queue.get(defaultName);
    Queue.register('default', drv);
  } catch {
    // Best-effort: external drivers may be registered by optional packages.
  }
}
