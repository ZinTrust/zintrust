import Queue from '@queue/Queue';
import InMemoryQueue from '@queue/drivers/InMemory';
import { describe, expect, it } from 'vitest';

describe('InMemory Queue Driver', () => {
  it('can enqueue and dequeue messages', async () => {
    Queue.register('inmemory', InMemoryQueue as any);

    const id = await Queue.enqueue('jobs', { foo: 'bar' }, 'inmemory');
    expect(typeof id).toBe('string');

    const len = await Queue.length('jobs', 'inmemory');
    expect(len).toBe(1);

    const msg = await Queue.dequeue<{ foo: string }>('jobs', 'inmemory');
    expect(msg).toBeDefined();
    expect(msg!.payload.foo).toBe('bar');

    await Queue.ack('jobs', msg!.id, 'inmemory');
    const len2 = await Queue.length('jobs', 'inmemory');
    expect(len2).toBe(0);
  });

  it('drains queue', async () => {
    Queue.register('inmemory', InMemoryQueue as any);
    await Queue.enqueue('jobs', { a: 1 }, 'inmemory');
    await Queue.enqueue('jobs', { a: 2 }, 'inmemory');
    let l = await Queue.length('jobs', 'inmemory');
    expect(l).toBe(2);

    await Queue.drain('jobs', 'inmemory');
    l = await Queue.length('jobs', 'inmemory');
    expect(l).toBe(0);
  });
});
