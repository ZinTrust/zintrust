import Queue from '@/tools/queue/Queue';
import { describe, expect, it } from 'vitest';

describe('Queue', () => {
  it('throws when asking for an unregistered driver', () => {
    expect(() => Queue.get('this-driver-does-not-exist')).toThrow(
      /Queue driver not registered: this-driver-does-not-exist/
    );
  });
});
