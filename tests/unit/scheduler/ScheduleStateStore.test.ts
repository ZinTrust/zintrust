import { describe, expect, it } from 'vitest';

import { InMemoryScheduleStateStore } from '@/scheduler/state/ScheduleStateStore';

describe('ScheduleStateStore', () => {
  it('stores and merges schedule state patches', async () => {
    const store = InMemoryScheduleStateStore.create();

    expect(await store.get('a')).toBeNull();

    await store.set('a', { lastRunAt: 1, lastSuccessAt: 1, consecutiveFailures: 0 });
    expect(await store.get('a')).toEqual({
      lastRunAt: 1,
      lastSuccessAt: 1,
      consecutiveFailures: 0,
    });

    await store.set('a', { lastErrorAt: 2, lastErrorMessage: 'boom', consecutiveFailures: 3 });
    expect(await store.get('a')).toEqual({
      lastRunAt: 1,
      lastSuccessAt: 1,
      lastErrorAt: 2,
      lastErrorMessage: 'boom',
      consecutiveFailures: 3,
    });

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('a');
  });
});
