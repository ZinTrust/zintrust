import { describe, expect, it, vi } from 'vitest';

describe('MemoryDriver', () => {
  it('performs basic operations and can dispose', async () => {
    vi.resetModules();

    // Stub setInterval to return an object with unref so create() can call it safely
    vi.stubGlobal('setInterval', (fn: any, _ms: number) => {
      const id = { unref: () => {}, __fn: fn };
      return id as unknown as number;
    });

    const clearSpy = vi.spyOn(globalThis as any, 'clearInterval');

    const mod = await import('@cache/drivers/MemoryDriver');
    const driver = mod.MemoryDriver.create();

    await driver.set('k', 'v');
    await expect(driver.get('k')).resolves.toBe('v');
    await expect(driver.has('k')).resolves.toBe(true);

    await driver.delete('k');
    await expect(driver.get('k')).resolves.toBeNull();
    await expect(driver.has('k')).resolves.toBe(false);

    await driver.set('a', 1);
    await driver.clear();
    await expect(driver.get('a')).resolves.toBeNull();

    if (driver.dispose) {
      await driver.dispose();
    }
    expect(clearSpy).toHaveBeenCalled();
  });
});
