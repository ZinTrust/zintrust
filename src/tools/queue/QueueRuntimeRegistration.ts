import { Logger } from '@config/logger';
import type { QueueConfig } from '@config/queue';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { detectRuntime } from '@runtime/detectRuntime';
import { DatabaseQueue } from '@tools/queue/drivers/Database';

import { InMemoryQueue } from '@tools/queue/drivers/InMemory';
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
  Queue.register('db', DatabaseQueue);
  // Project templates use QUEUE_DRIVER=sync; treat this as an alias of in-memory.
  Queue.register('sync', InMemoryQueue);
  const defaultName = (config.default ?? '').toString().trim().toLowerCase();
  if (defaultName.length === 0) {
    throw ErrorFactory.createConfigError('Queue default driver is not configured');
  }

  try {
    const drv = Queue.get(defaultName);
    Queue.register('default', drv);
  } catch (error) {
    const { isCloudflare } = detectRuntime();
    if (isCloudflare) {
      Logger.warn(
        `[queue] Default driver '${defaultName}' is unavailable in Cloudflare runtime; falling back to 'sync'.`
      );
      Queue.register('default', Queue.get('sync'));
      return;
    }

    throw error;
  }
}
