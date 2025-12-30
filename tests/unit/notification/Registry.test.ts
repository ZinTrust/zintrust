import { NotificationRegistry } from '@notification/Registry';
import { describe, expect, it } from 'vitest';

describe('Notification Registry', () => {
  it('lists default drivers and allows registration', () => {
    const list = NotificationRegistry.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toContain('termii');
    expect(list).toContain('console');

    NotificationRegistry.register('dummy', { send: async () => ({ ok: true }) } as any);
    expect(NotificationRegistry.list()).toContain('dummy');
  });

  it('get throws for unknown driver', () => {
    expect(() => NotificationRegistry.get('nope')).toThrow();
  });
});
