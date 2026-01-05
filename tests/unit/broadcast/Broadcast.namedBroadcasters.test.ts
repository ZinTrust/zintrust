import { describe, expect, it, vi } from 'vitest';

import { BroadcastRegistry } from '@broadcast/BroadcastRegistry';
import { registerBroadcastersFromRuntimeConfig } from '@broadcast/BroadcastRuntimeRegistration';

describe('Broadcast named broadcasters', () => {
  it('throws when selecting an unknown broadcaster explicitly', async () => {
    vi.resetModules();
    const mod = await import('../../../src/tools/broadcast/Broadcast');
    await expect(mod.Broadcast.broadcaster('nope').send('ch', 'ev', {})).rejects.toThrow(
      /Broadcast driver not configured/
    );
  });

  it("registers configured drivers and aliases 'default'", () => {
    BroadcastRegistry.reset();

    registerBroadcastersFromRuntimeConfig({
      default: 'redis',
      drivers: {
        redis: {
          driver: 'redis',
          host: 'localhost',
          port: 6379,
          password: '',
          channelPrefix: 'b:',
        },
      },
    });

    expect(BroadcastRegistry.has('redis')).toBe(true);
    expect(BroadcastRegistry.has('default')).toBe(true);
    expect(BroadcastRegistry.get('default').driver).toBe('redis');
  });

  it('throws when broadcast default driver is empty', () => {
    BroadcastRegistry.reset();

    expect(() =>
      registerBroadcastersFromRuntimeConfig({
        default: '',
        drivers: {
          inmemory: { driver: 'inmemory' } as any,
        },
      })
    ).toThrow(/Broadcast default driver is not configured/i);
  });

  it('throws when broadcast default driver is not configured', () => {
    BroadcastRegistry.reset();

    expect(() =>
      registerBroadcastersFromRuntimeConfig({
        default: 'redis',
        drivers: {
          inmemory: { driver: 'inmemory' } as any,
        },
      })
    ).toThrow(/Broadcast default driver not configured/i);
  });
});
