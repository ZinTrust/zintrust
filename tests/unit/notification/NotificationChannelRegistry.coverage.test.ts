import { NotificationChannelRegistry } from '@notification/NotificationChannelRegistry';
import { beforeEach, describe, expect, it } from 'vitest';

describe('NotificationChannelRegistry patch coverage', () => {
  beforeEach(() => {
    NotificationChannelRegistry.reset();
  });

  it('throws when getting missing channel', () => {
    expect(() => NotificationChannelRegistry.get('missing')).toThrow(/not registered/i);
  });

  it('lists channels sorted', () => {
    NotificationChannelRegistry.register('B', { driver: 'console' } as any);
    NotificationChannelRegistry.register('a', { driver: 'console' } as any);

    expect(NotificationChannelRegistry.list()).toEqual(['a', 'b']);
  });
});
