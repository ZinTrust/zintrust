import { describe, expect, it } from 'vitest';
import type {
  DeduplicationOptions,
  ReleaseCondition,
  LockOptions,
  Lock,
  LockStatus,
  LockProviderConfig,
  QueueConfig,
  AdvancedJobOptions,
  JobResult,
  LockProvider,
} from '@/types/Queue';

describe('types/Queue', () => {
  it('should export DeduplicationOptions type', () => {
    const options: DeduplicationOptions = { id: 'test' };
    expect(options).toBeDefined();
  });

  it('should export ReleaseCondition type', () => {
    const condition: ReleaseCondition = { condition: 'test' };
    expect(condition).toBeDefined();
  });

  it('should export LockOptions type', () => {
    const options: LockOptions = {};
    expect(options).toBeDefined();
  });

  it('should export Lock type', () => {
    const lock: Lock = {
      key: 'test',
      ttl: 1000,
      acquired: true,
      expires: new Date(),
    };
    expect(lock).toBeDefined();
  });

  it('should export LockStatus type', () => {
    const status: LockStatus = { exists: false };
    expect(status).toBeDefined();
  });

  it('should export LockProviderConfig type', () => {
    const config: LockProviderConfig = { type: 'memory' };
    expect(config).toBeDefined();
  });

  it('should export QueueConfig type', () => {
    const config: QueueConfig = { name: 'test' };
    expect(config).toBeDefined();
  });

  it('should export AdvancedJobOptions type', () => {
    const options: AdvancedJobOptions = {};
    expect(options).toBeDefined();
  });

  it('should export JobResult type', () => {
    const result: JobResult = {
      id: 'test',
      deduplicated: false,
      status: 'queued',
    };
    expect(result).toBeDefined();
  });

  it('should export LockProvider type', () => {
    const provider: LockProvider = {} as LockProvider;
    expect(provider).toBeDefined();
  });
});
