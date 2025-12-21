import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MemoryDriver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
  });

  it('get/set: returns stored values and supports generic typing', async () => {
    const { MemoryDriver } = await import('@cache/drivers/MemoryDriver');

    const driver = new MemoryDriver();

    await driver.set('a', { n: 1 });
    const value = await driver.get<{ n: number }>('a');

    expect(value).toEqual({ n: 1 });
    expect(await driver.get('missing')).toBeNull();
    expect(await driver.has('missing')).toBe(false);
  });

  it('get/has: expires items with ttl and deletes on access', async () => {
    const { MemoryDriver } = await import('@cache/drivers/MemoryDriver');

    const driver = new MemoryDriver();

    // Key "k": cover expiry path inside get()
    await driver.set('k', 'v', 1);
    expect(await driver.get<string>('k')).toBe('v');
    vi.advanceTimersByTime(1001);
    expect(await driver.get<string>('k')).toBeNull();

    // Key "h": cover expiry path inside has()
    await driver.set('h', 'v', 1);
    vi.advanceTimersByTime(1001);
    expect(await driver.has('h')).toBe(false);
    expect(await driver.get<string>('h')).toBeNull();
  });

  it('delete/clear: removes entries', async () => {
    const { MemoryDriver } = await import('@cache/drivers/MemoryDriver');

    const driver = new MemoryDriver();

    await driver.set('a', 1);
    await driver.set('b', 2);

    await driver.delete('a');
    expect(await driver.get<number>('a')).toBeNull();
    expect(await driver.get<number>('b')).toBe(2);

    await driver.clear();
    expect(await driver.get<number>('b')).toBeNull();
  });

  it('set: stores null expiry when ttl is undefined', async () => {
    const { MemoryDriver } = await import('@cache/drivers/MemoryDriver');

    const driver = new MemoryDriver();

    await driver.set('p', 'perm');

    vi.advanceTimersByTime(60_000);

    expect(await driver.has('p')).toBe(true);
    expect(await driver.get<string>('p')).toBe('perm');
  });

  it('cleanup: restores timers', () => {
    vi.useRealTimers();
    expect(true).toBe(true);
  });
});
