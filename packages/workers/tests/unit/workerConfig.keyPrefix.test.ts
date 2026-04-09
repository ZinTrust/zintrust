import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_APP_NAME = process.env['APP_NAME'];
const ORIGINAL_WORKER_PREFIX = process.env['WORKER_PERSISTENCE_REDIS_KEY_PREFIX'];

describe('workerConfig keyPrefix', () => {
  afterEach(() => {
    vi.resetModules();

    if (ORIGINAL_APP_NAME === undefined) {
      delete process.env['APP_NAME'];
    } else {
      process.env['APP_NAME'] = ORIGINAL_APP_NAME;
    }

    if (ORIGINAL_WORKER_PREFIX === undefined) {
      delete process.env['WORKER_PERSISTENCE_REDIS_KEY_PREFIX'];
    } else {
      process.env['WORKER_PERSISTENCE_REDIS_KEY_PREFIX'] = ORIGINAL_WORKER_PREFIX;
    }
  });

  it('defaults to a normalized APP_NAME worker registry key', async () => {
    process.env['APP_NAME'] = 'Vizo Zintrust Development';
    delete process.env['WORKER_PERSISTENCE_REDIS_KEY_PREFIX'];

    const { keyPrefix } = await import('../../src/config/workerConfig');

    expect(keyPrefix()).toBe('vizo_zintrust_development_zintrust:workers:');
  });

  it('trims leading and trailing underscores without regex backtracking', async () => {
    process.env['APP_NAME'] = '___ Vizo@@@ Zintrust Development ___';
    delete process.env['WORKER_PERSISTENCE_REDIS_KEY_PREFIX'];

    const { keyPrefix } = await import('../../src/config/workerConfig');

    expect(keyPrefix()).toBe('vizo_zintrust_development_zintrust:workers:');
  });

  it('uses the explicit WORKER_PERSISTENCE_REDIS_KEY_PREFIX as-is when provided', async () => {
    process.env['APP_NAME'] = 'Ignored App Name';
    process.env['WORKER_PERSISTENCE_REDIS_KEY_PREFIX'] = 'custom_workers_prefix:';

    const { keyPrefix } = await import('../../src/config/workerConfig');

    expect(keyPrefix()).toBe('custom_workers_prefix:');
  });
});
