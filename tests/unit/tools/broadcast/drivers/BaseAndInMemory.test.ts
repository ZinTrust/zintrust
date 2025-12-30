import { BaseDriver as BroadcastBase } from '@tools/broadcast/drivers/BaseDriver';
import { InMemoryDriver } from '@tools/broadcast/drivers/InMemory';
import { describe, expect, it } from 'vitest';

describe('Broadcast drivers - Base and InMemory', () => {
  it('BaseDriver.send throws config error', async () => {
    await expect(BroadcastBase.send()).rejects.toBeDefined();
  });

  it('InMemoryDriver stores events and resets', async () => {
    InMemoryDriver.reset();
    const res = await InMemoryDriver.send({}, 'chan', 'ev', { a: 1 });
    expect(res).toEqual({ ok: true });
    const events = InMemoryDriver.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ channel: 'chan', event: 'ev', data: { a: 1 } });
    InMemoryDriver.reset();
    expect(InMemoryDriver.getEvents()).toHaveLength(0);
  });
});
