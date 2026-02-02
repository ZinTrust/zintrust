import { describe, expect, it } from 'vitest';

import { detectCloudflareWorkers, detectRuntimePlatform, RUNTIME_PLATFORM } from '@zintrust/core';

describe('RuntimeServices platform detection', () => {
  it('detects node runtime when no Workers env', () => {
    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    delete (globalThis as unknown as { env?: unknown }).env;

    expect(detectCloudflareWorkers()).toBe(false);
    expect(detectRuntimePlatform()).toBe('nodejs');
    expect(RUNTIME_PLATFORM).toBeDefined();

    if (originalEnv !== undefined) {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }
  });

  it('detects cloudflare runtime when Workers env present', () => {
    const originalEnv = (globalThis as unknown as { env?: unknown }).env;
    (globalThis as unknown as { env?: unknown }).env = {};

    expect(detectCloudflareWorkers()).toBe(true);
    expect(detectRuntimePlatform()).toBe('cloudflare');

    if (originalEnv === undefined) {
      delete (globalThis as unknown as { env?: unknown }).env;
    } else {
      (globalThis as unknown as { env?: unknown }).env = originalEnv;
    }
  });
});
