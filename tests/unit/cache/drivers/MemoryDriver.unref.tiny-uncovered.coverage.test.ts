import { describe, expect, it, vi } from 'vitest';

describe('MemoryDriver (tiny uncovered)', () => {
  it('calls unref() on cleanup interval timer', async () => {
    const originalSetInterval = globalThis.setInterval;

    const unref = vi.fn();
    const fakeTimer = { unref } as unknown as ReturnType<typeof setInterval>;

    // Patch setInterval so we can assert unref() is called.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).setInterval = vi.fn(() => fakeTimer);

    try {
      const { MemoryDriver } = await import('@cache/drivers/MemoryDriver');
      const driver = MemoryDriver.create();
      expect(driver).toBeDefined();
      expect(unref).toHaveBeenCalledTimes(1);

      // Cleanup the interval (only call dispose if available)
      if (typeof driver.dispose === 'function') {
        await driver.dispose();
      }
    } finally {
      globalThis.setInterval = originalSetInterval;
    }
  });
});
