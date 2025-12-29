import NotificationDriver from '@tools/notification/Driver';
import { describe, expect, it } from 'vitest';

describe('Notification Driver placeholder', () => {
  it('default export is an object placeholder', () => {
    expect(typeof NotificationDriver).toBe('object');
  });
});
