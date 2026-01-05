import { describe, expect, it } from 'vitest';

import { BroadcastRegistry } from '@broadcast/BroadcastRegistry';

describe('BroadcastRegistry patch coverage (extra)', () => {
  it('throws when a broadcast driver is missing', () => {
    BroadcastRegistry.reset();
    expect(() => BroadcastRegistry.get('missing')).toThrow(/Broadcast driver not configured/i);
  });

  it('lists registered broadcaster keys', () => {
    BroadcastRegistry.reset();
    BroadcastRegistry.register('a', { driver: 'inmemory' } as any);
    BroadcastRegistry.register('b', { driver: 'inmemory' } as any);

    expect(BroadcastRegistry.list().sort()).toEqual(['a', 'b']);
  });
});
