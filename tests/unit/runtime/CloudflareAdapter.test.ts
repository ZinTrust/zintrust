import { CloudflareAdapter } from '@/runtime/adapters/CloudflareAdapter';
import { describe, expect, it } from 'vitest';

describe('CloudflareAdapter', () => {
  it('should identify as cloudflare platform', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.platform).toBe('cloudflare');
  });

  it('supportsPersistentConnections should be false', () => {
    const adapter = CloudflareAdapter.create({
      handler: async () => undefined,
    });

    expect(adapter.supportsPersistentConnections()).toBe(false);
  });
});
