import { describe, expect, it } from 'vitest';

import { queueConfig } from '@/config/queue';
import { Queue } from '@/tools/queue/Queue';
import { registerQueuesFromRuntimeConfig } from '@/tools/queue/QueueRuntimeRegistration';

describe('QueueRuntimeRegistration', () => {
  it('registers built-in drivers and default alias', async () => {
    await registerQueuesFromRuntimeConfig(queueConfig);

    expect(() => Queue.get('sync')).not.toThrow();
    expect(() => Queue.get('inmemory')).not.toThrow();

    // default alias should exist when the default is registered
    // (in templates this is typically "sync").
    expect(() => Queue.get('default')).not.toThrow();
  });

  it('throws when default driver is empty', async () => {
    Queue.reset();

    await expect(
      registerQueuesFromRuntimeConfig({
        default: '',
      } as any)
    ).rejects.toThrow(/Queue default driver is not configured/i);
  });
});
