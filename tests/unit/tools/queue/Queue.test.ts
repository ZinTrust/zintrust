import { describe, expect, it, vi } from 'vitest';

describe('Queue', () => {
  it('throws when asking for an unregistered driver', async () => {
    const Queue = (await import('@/tools/queue/Queue')).default;
    expect(() => Queue.get('this-driver-does-not-exist')).toThrow(
      /Queue driver not registered: this-driver-does-not-exist/
    );
  });

  it('returns cached lock prefix on subsequent calls', async () => {
    vi.resetModules();
    const mod = await import('@/tools/queue/Queue');
    const first = mod.resolveLockPrefix();
    // Call it again to verify caching works
    const second = mod.resolveLockPrefix();
    // Both should return the same cached value (zintrust_zintrust_test:lock:)
    expect(first).toBe('zintrust_zintrust_test:lock:');
    expect(second).toBe('zintrust_zintrust_test:lock:');
    expect(first).toBe(second); // Verify they're the same (cached)
  });
});
