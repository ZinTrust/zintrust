import { MemoryDriver } from '@cache/drivers/MemoryDriver';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MemoryDriver (coverage)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires keys and dispose clears interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const driver = MemoryDriver.create();

    await driver.set('a', 1, 1);
    expect(await driver.has('a')).toBe(true);
    expect(await driver.get('a')).toBe(1);

    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    expect(await driver.has('a')).toBe(false);
    expect(await driver.get('a')).toBeNull();

    await driver.dispose();
  });
});
