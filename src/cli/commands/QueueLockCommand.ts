/**
 * Queue Lock Command Extensions
 * Implements CLI commands for managing queue locks and deduplication
 */

import { ErrorFactory } from '@/exceptions/ZintrustError';
import { ZintrustLang } from '@/lang/lang';
import type { LockProvider, QueueConfig } from '@/types/Queue';
import { Logger } from '@config/logger';
import { createAdvancedQueue } from '@queue/AdvancedQueue';
import { getLockProvider } from '@queue/LockProvider';
import type { Command } from 'commander';

// Reusing initialization logic from AdvancedQueue
// But we need direct access to lock provider for maintenance
// AdvancedQueue only exposes limited interface

function getProvider(providerName: string = 'redis'): LockProvider {
  // Create proper QueueConfig object that matches the expected interface
  const advancedQueueConfig: QueueConfig = {
    name: ZintrustLang.CLI_LOCKS,
    connection: undefined, // No specific connection needed for CLI operations
    defaultDedupTtl: ZintrustLang.ZINTRUST_LOCKS_TTL,
    lockProvider: providerName,
  };

  // Need to ensure provider is registered. creating AdvancedQueue triggers registration.
  createAdvancedQueue(advancedQueueConfig);

  const provider = getLockProvider(providerName);
  if (!provider) {
    throw ErrorFactory.createCliError(`Lock provider '${providerName}' not found.`);
  }
  return provider;
}

const setupLockListCommand = (command: Command): void => {
  command
    .command('lock:list')
    .description('List active deduplication locks')
    .option('--pattern <pattern>', 'Key pattern to match (default: *)', '*')
    .option('--provider <name>', 'Lock provider name (default: redis)', 'redis')
    .action(async (options: { pattern: string; provider: string }) => {
      try {
        const provider = getProvider(options.provider);
        const locks: string[] = await provider.list(options?.pattern ?? '*');

        if (locks.length === 0) {
          Logger.info('No locks found.');
          return;
        }

        Logger.info(`Found ${locks.length} locks:`);

        // Batch all status checks for better performance
        const statusPromises = locks.map(async (key: string) => {
          const status = await provider.status(key);
          const expires = status.expires ? status.expires.toISOString() : 'never';
          const ttl =
            typeof status.ttl === 'number' ? `${Math.round(status.ttl / 1000)}s` : 'unknown';
          return { key, ttl, expires };
        });

        const lockStatuses = await Promise.all(statusPromises);

        for (const { key, ttl, expires } of lockStatuses) {
          Logger.info(`- [${key}] (TTL: ${ttl}, Expires: ${expires})`);
        }
      } catch (error) {
        Logger.error('Failed to list locks', error);
      }
    });
};

const setupLockReleaseCommand = (command: Command): void => {
  command
    .command('lock:release <key>')
    .description('Manually release a deduplication lock')
    .option('--provider <name>', 'Lock provider name (default: redis)', 'redis')
    .action(async (key: string, options: { provider: string }) => {
      try {
        const provider = getProvider(options.provider);
        const status = await provider.status(key);

        if (!status.exists) {
          Logger.info(`Lock '${key}' does not exist.`);
          return;
        }

        await provider.release({ key, ttl: 0, acquired: true, expires: new Date() });
        Logger.info(`Lock '${key}' released successfully.`);
      } catch (error) {
        Logger.error(`Failed to release lock ${key}`, error);
      }
    });
};

const setupLockExtendCommand = (command: Command): void => {
  command
    .command('lock:extend <key> <seconds>')
    .description('Extend TTL of an existing lock')
    .option('--provider <name>', 'Lock provider name (default: redis)', 'redis')
    .action(async (key: string, seconds: string, options: { provider: string }) => {
      try {
        const ttl = Number.parseInt(seconds, 10) * 1000;
        const provider = getProvider(options.provider);

        // Mock lock object for extension
        const lock = { key, ttl: 0, acquired: true, expires: new Date() };
        const extended = await provider.extend(lock, ttl);

        if (extended) {
          Logger.info(`Lock '${key}' extended by ${seconds} seconds.`);
        } else {
          Logger.info(`Failed to extend lock '${key}' (may not exist).`);
        }
      } catch (error) {
        Logger.error(`Failed to extend lock ${key}`, error);
      }
    });
};

const setupDedupeStatusCommand = (command: Command): void => {
  command
    .command('dedupe:status <id>')
    .description('Check deduplication status of a job ID')
    .option('--provider <name>', 'Lock provider name (default: redis)', 'redis')
    .action(async (id: string, options: { provider: string }) => {
      try {
        const provider = getProvider(options.provider);
        const status = await provider.status(id);

        if (status.exists) {
          Logger.info(`Job ID '${id}' is currently LOCKED (Deduplicated).`);
          const ttlMs = status.ttl;
          const ttlSeconds =
            ttlMs !== null && ttlMs !== undefined && !Number.isNaN(ttlMs) && ttlMs > 0
              ? Math.round(ttlMs / 1000) + 's'
              : 'unknown';
          Logger.info(`TTL Remaining: ${ttlSeconds}`);
          Logger.info(`Expires At: ${status.expires ? status.expires.toISOString() : 'unknown'}`);
        } else {
          Logger.info(`Job ID '${id}' is NOT locked (Ready for processing or expired).`);
        }
      } catch (error) {
        Logger.error(`Failed to check status for ${id}`, error);
      }
    });
};

export function setupQueueLockCommands(command: Command): void {
  setupLockListCommand(command);
  setupLockReleaseCommand(command);
  setupLockExtendCommand(command);
  setupDedupeStatusCommand(command);
}
