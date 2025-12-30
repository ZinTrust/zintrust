import { describe, expect, it, vi } from 'vitest';

describe('InMemoryQueue extra coverage', () => {
  it('uses the store.set branch on first enqueue', async () => {
    vi.resetModules();

    const { InMemoryQueue } = await import('@/tools/queue/drivers/InMemory');

    await InMemoryQueue.enqueue('q1', { ok: true });
    expect(await InMemoryQueue.length('q1')).toBe(1);
  });

  it('returns undefined when dequeue is called on an empty queue', async () => {
    vi.resetModules();

    const { InMemoryQueue } = await import('@/tools/queue/drivers/InMemory');

    // Ensure the queue exists but is empty
    await InMemoryQueue.drain('q-empty');

    await expect(InMemoryQueue.dequeue('q-empty')).resolves.toBeUndefined();
  });
});
