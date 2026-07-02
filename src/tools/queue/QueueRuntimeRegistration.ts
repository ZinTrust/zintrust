import { Env } from '@config/env';
import { Logger } from '@config/logger';
import type { QueueConfig } from '@config/queue';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { ZintrustLang } from '@lang/lang';
import { existsSync } from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { pathToFileURL } from '@node-singletons/url';
import { detectRuntime } from '@runtime/detectRuntime';
import { DatabaseQueue } from '@tools/queue/drivers/Database';
import { InMemoryQueue } from '@tools/queue/drivers/InMemory';
import { autoRegisterJobStateTrackerPersistenceFromEnv } from '@tools/queue/JobStateTrackerDbPersistence';
import { Queue } from '@tools/queue/Queue';
import { QueueReliabilityOrchestrator } from '@tools/queue/QueueReliabilityOrchestrator';

const QUEUE_REDIS_PACKAGE = '@zintrust/queue-redis';
const ZEDGI_PACKAGE = '@zintrust/zedgi';

/**
 * Register queue drivers from runtime config.
 *
 * This follows the framework's config-driven availability pattern:
 * - Built-in drivers are registered so `QUEUE_DRIVER=sync|inmemory|redis` works out of the box.
 * - If the configured default is registered, it is ALSO registered as 'default'.
 * - Unknown/unregistered driver names still throw when selected.
 */

const isDriverRegistered = (name: string): boolean => {
  try {
    Queue.get(name);
    return true;
  } catch {
    return false;
  }
};

const getLocalPackageUrl = (pkgFolder: string): string | null => {
  try {
    const cwd =
      typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '';
    if (cwd.trim() === '') return null;

    const localEntry = path.join(cwd, 'dist', 'packages', pkgFolder, 'src', 'index.js');
    if (!existsSync(localEntry)) return null;

    return pathToFileURL(localEntry).href;
  } catch {
    return null;
  }
};

const registerRedisDriverIfAvailable = async (): Promise<boolean> => {
  if (isDriverRegistered('redis')) {
    return true;
  }

  const tryRegister = (mod: { RedisQueue?: typeof Queue; BullMQRedisQueue?: typeof Queue }): boolean => {
    if (mod.RedisQueue !== undefined) {
      Queue.register('redis', mod.RedisQueue as unknown as Parameters<typeof Queue.register>[1]);
      return true;
    }

    if (mod.BullMQRedisQueue !== undefined) {
      Queue.register(
        'redis',
        mod.BullMQRedisQueue as unknown as Parameters<typeof Queue.register>[1]
      );
      return true;
    }
    return false;
  };

  // Fall back to dynamic import only if not already registered
  try {
    const mod = (await import(/* @vite-ignore */ QUEUE_REDIS_PACKAGE)) as unknown as {
      RedisQueue?: typeof Queue;
      BullMQRedisQueue?: typeof Queue;
    };

    if (tryRegister(mod)) {
      return true;
    }
  } catch {
    // Fall back to local dist build output when running inside the core repo Docker image.
    // In that environment, `@zintrust/queue-redis` is not installed in node_modules,
    // but the compiled package is available at `dist/packages/queue-redis`.
    try {
      const url = getLocalPackageUrl('queue-redis');
      if (url !== null) {
        const localMod = (await import(url)) as unknown as {
          RedisQueue?: typeof Queue;
          BullMQRedisQueue?: typeof Queue;
        };

        if (tryRegister(localMod)) {
          return true;
        }
      }
    } catch {
      // ignore
    }

    return false;
  }

  return false;
};

const registerZedgiQueueDriverIfAvailable = async (config: QueueConfig): Promise<boolean> => {
  if (isDriverRegistered('queue-zedgi')) {
    return true;
  }

  const tryRegister = (mod: {
    ZedgiQueueDriver?: {
      create: (config: unknown) => Parameters<typeof Queue.register>[1];
    };
  }): boolean => {
    if (mod.ZedgiQueueDriver !== undefined) {
      Queue.register('queue-zedgi', mod.ZedgiQueueDriver.create(config.drivers['queue-zedgi']));
      return true;
    }
    return false;
  };

  // Fall back to dynamic import only if not already registered
  try {
    const mod = (await import(/* @vite-ignore */ ZEDGI_PACKAGE)) as unknown as {
      ZedgiQueueDriver?: {
        create: (config: unknown) => Parameters<typeof Queue.register>[1];
      };
    };

    if (tryRegister(mod)) {
      return true;
    }
  } catch {
    try {
      const url = getLocalPackageUrl('zedgi');
      if (url !== null) {
        const localMod = (await import(url)) as unknown as {
          ZedgiQueueDriver?: {
            create: (config: unknown) => Parameters<typeof Queue.register>[1];
          };
        };

        if (tryRegister(localMod)) {
          return true;
        }
      }
    } catch {
      // ignore
    }

    return false;
  }

  return false;
};

export async function registerQueuesFromRuntimeConfig(config: QueueConfig): Promise<void> {
  autoRegisterJobStateTrackerPersistenceFromEnv();

  // Built-in drivers (core)
  Queue.register('inmemory', InMemoryQueue);
  Queue.register(ZintrustLang.DATABASE, DatabaseQueue);
  // Project templates use QUEUE_DRIVER=sync; treat this as an alias of in-memory.
  Queue.register('sync', InMemoryQueue);
  const defaultName = (config.default ?? '').toString().trim().toLowerCase();
  if (defaultName.length === 0) {
    throw ErrorFactory.createConfigError('Queue default driver is not configured');
  }

  if (defaultName === 'redis') {
    const registered = await registerRedisDriverIfAvailable();
    if (!registered) {
      throw ErrorFactory.createConfigError(
        'Redis queue driver is not registered. Install queue:redis via zin plugin install.'
      );
    }
  }

  if (defaultName === 'queue-zedgi') {
    const registered = await registerZedgiQueueDriverIfAvailable(config);
    if (!registered) {
      throw ErrorFactory.createConfigError(
        'Zedgi queue driver is not registered. Install @zintrust/zedgi.'
      );
    }
  }

  try {
    const drv = Queue.get(defaultName);
    Queue.register('default', drv);

    if (Env.getBool('JOB_RELIABILITY_AUTOSTART', false)) {
      QueueReliabilityOrchestrator.start();
    }
  } catch (error) {
    const { isCloudflare } = detectRuntime();
    if (isCloudflare) {
      Logger.warn(
        `[queue] Default driver '${defaultName}' is unavailable in Cloudflare runtime; falling back to 'sync'.`
      );
      Queue.register('default', Queue.get('sync'));
      return;
    }

    throw ErrorFactory.createConfigError('Queue default driver is not available', error);
  }
}
