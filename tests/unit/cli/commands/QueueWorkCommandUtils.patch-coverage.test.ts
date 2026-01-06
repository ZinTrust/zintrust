import { describe, expect, it } from 'vitest';

describe('QueueWorkCommandUtils (patch coverage)', () => {
  it('requireQueueNameFromArgs throws when queueName is missing', async () => {
    const { QueueWorkCommandUtils } = await import('@/cli/commands/QueueWorkCommandUtils');

    expect(() =>
      QueueWorkCommandUtils.requireQueueNameFromArgs(undefined, 'zin queue:work myQueue')
    ).toThrow(/Missing <queueName>/);
  });
});
