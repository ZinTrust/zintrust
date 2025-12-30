import Queue from '@queue/Queue';
import InMemoryQueue from '@queue/drivers/InMemory';
import { describe, expect, it } from 'vitest';

describe('InMemory Queue Driver', () => {
  it('can enqueue and dequeue messages', async () => {
    Queue.register('inmemory', InMemoryQueue as any);

    const id = await Queue.enqueue('jobs', { foo: 'bar' });
    expect(typeof id).toBe('string');

    const len = await Queue.length('jobs');
    expect(len).toBe(1);

    const msg = await Queue.dequeue<{ foo: string }>('jobs');
    expect(msg).toBeDefined();
    expect(msg!.payload.foo).toBe('bar');

    await Queue.ack('jobs', msg!.id);
    const len2 = await Queue.length('jobs');
    expect(len2).toBe(0);
  });

  it('drains queue', async () => {
    Queue.register('inmemory', InMemoryQueue as any);
    await Queue.enqueue('jobs', { a: 1 });
    await Queue.enqueue('jobs', { a: 2 });
    let l = await Queue.length('jobs');
    expect(l).toBe(2);

    await Queue.drain('jobs');
    l = await Queue.length('jobs');
    expect(l).toBe(0);
  });
});
