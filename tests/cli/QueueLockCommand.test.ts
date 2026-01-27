import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupQueueLockCommands } from '@cli/commands/QueueLockCommand';
import { createLockProvider, registerLockProvider } from '@queue/LockProvider';

describe('QueueLockCommand', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.QUEUE_LOCK_PROVIDER = 'memory';
    process.env.QUEUE_LOCK_PREFIX = 'test:';
    process.env.QUEUE_DEFAULT_DEDUP_TTL = '1000';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('lists locks and prints status', async () => {
    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);
    await provider.acquire('job-1', { ttl: 1000 });

    const program = new Command();
    program.exitOverride();
    setupQueueLockCommands(program);

    await program.parseAsync(['lock:list', '--provider', 'memory'], { from: 'user' });
  });

  it('releases lock via command', async () => {
    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);
    await provider.acquire('job-2', { ttl: 1000 });

    const program = new Command();
    program.exitOverride();
    setupQueueLockCommands(program);

    await program.parseAsync(['lock:release', 'job-2', '--provider', 'memory'], { from: 'user' });

    const status = await provider.status('job-2');
    expect(status.exists).toBe(false);
  });

  it('extends lock via command', async () => {
    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);
    await provider.acquire('job-3', { ttl: 1000 });

    const program = new Command();
    program.exitOverride();
    setupQueueLockCommands(program);

    await program.parseAsync(['lock:extend', 'job-3', '5', '--provider', 'memory'], {
      from: 'user',
    });

    const status = await provider.status('job-3');
    expect(status.exists).toBe(true);
  });

  it('checks dedupe status via command', async () => {
    const provider = createLockProvider({
      type: 'memory',
      prefix: 'test:',
      defaultTtl: 1000,
    });
    registerLockProvider('memory', provider);
    await provider.acquire('job-4', { ttl: 1000 });

    const program = new Command();
    program.exitOverride();
    setupQueueLockCommands(program);

    await program.parseAsync(['dedupe:status', 'job-4', '--provider', 'memory'], { from: 'user' });

    const status = await provider.status('job-4');
    expect(status.exists).toBe(true);
  });
});
