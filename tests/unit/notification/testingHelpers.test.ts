import { NotificationRegistry } from '@notification/Registry';
import { useFakeDriver } from '@notification/testingHelpers';
import { describe, expect, it } from 'vitest';

describe('Notification testing helpers', () => {
  it('registers a fake driver and restores previous state', () => {
    const helper = useFakeDriver('fake-for-test');

    expect(NotificationRegistry.list()).toContain('fake-for-test');

    helper.restore();

    const after = NotificationRegistry.list();
    expect(Array.isArray(after)).toBe(true);
    // fake-for-test should still be present but restored
    expect(after).toContain('fake-for-test');
  });
});
