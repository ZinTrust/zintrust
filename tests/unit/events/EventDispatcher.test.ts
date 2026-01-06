import { EventDispatcher } from '@events/EventDispatcher';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { Logger } from '@config/logger';

describe('EventDispatcher', () => {
  it('on/off manages listener count and cleanup', () => {
    const bus = EventDispatcher.create<{ ping: string }>();

    const fn = vi.fn();
    const off = bus.on('ping', fn);

    expect(bus.listenerCount('ping')).toBe(1);
    bus.emit('ping', 'hello');
    expect(fn).toHaveBeenCalledWith('hello');

    off();
    expect(bus.listenerCount('ping')).toBe(0);

    bus.emit('ping', 'again');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once runs a listener once and supports explicit unsubscribe', async () => {
    const bus = EventDispatcher.create<{ ping: number }>();

    const fn = vi.fn(async () => undefined);
    const off = bus.once('ping', fn);

    bus.emit('ping', 1);
    bus.emit('ping', 2);

    // once() wraps listener as async; flush microtasks.
    await new Promise((r) => setTimeout(r, 0));

    expect(fn).toHaveBeenCalledTimes(1);

    off();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('emit snapshots listeners to tolerate mutation during dispatch', () => {
    const bus = EventDispatcher.create<{ ping: string }>();

    const second = vi.fn();
    const offSecond = bus.on('ping', second);

    const first = vi.fn(() => {
      offSecond();
    });

    bus.on('ping', first);
    bus.emit('ping', 'x');

    // Snapshot means second still runs even if first unsubscribes it.
    expect(first).toHaveBeenCalledWith('x');
    expect(second).toHaveBeenCalledWith('x');
  });

  it('emit logs unhandled async listener errors (fire-and-forget)', async () => {
    const bus = EventDispatcher.create<{ ping: string }>();

    bus.on('ping', async () => {
      throw new Error('boom');
    });

    bus.emit('ping', 'x');

    await new Promise((r) => setTimeout(r, 0));

    expect(Logger.error).toHaveBeenCalledWith('Unhandled async event listener error', {
      event: 'ping',
      error: expect.any(Error),
    });
  });

  it('emitAsync throws the underlying error when one listener fails', async () => {
    const bus = EventDispatcher.create<{ ping: string }>();
    const err = new Error('one');

    bus.on('ping', async () => undefined);
    bus.on('ping', async () => {
      throw err;
    });

    await expect(bus.emitAsync('ping', 'x')).rejects.toBe(err);
  });

  it('emitAsync throws AggregateError when multiple listeners fail', async () => {
    const bus = EventDispatcher.create<{ ping: string }>();

    bus.on('ping', async () => {
      throw new Error('a');
    });
    bus.on('ping', async () => {
      throw new Error('b');
    });

    await expect(bus.emitAsync('ping', 'x')).rejects.toBeInstanceOf(AggregateError);
  });

  it('clear removes listeners for a specific event or all events', () => {
    const bus = EventDispatcher.create<{ a: number; b: number }>();
    bus.on('a', () => undefined);
    bus.on('b', () => undefined);

    expect(bus.listenerCount('a')).toBe(1);
    expect(bus.listenerCount('b')).toBe(1);

    bus.clear('a');
    expect(bus.listenerCount('a')).toBe(0);
    expect(bus.listenerCount('b')).toBe(1);

    bus.clear();
    expect(bus.listenerCount('b')).toBe(0);
  });
});
