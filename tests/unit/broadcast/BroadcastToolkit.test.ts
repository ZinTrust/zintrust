import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@broadcast/Broadcast', () => ({
  Broadcast: { send: vi.fn(async () => ({ ok: true })) },
}));

import { sendBroadcast } from '@app/Toolkit/Broadcast/sendBroadcast';
import { Broadcast } from '@broadcast/Broadcast';

describe('Broadcast toolkit', () => {
  beforeEach(() => vi.resetAllMocks());

  it('delegates to Broadcast.send', async () => {
    await sendBroadcast('ch', 'MyEvent', { a: 1 });
    expect((Broadcast.send as any).mock.calls.length).toBe(1);
    const [ch, ev, data] = (Broadcast.send as any).mock.calls[0];
    expect(ch).toBe('ch');
    expect(ev).toBe('MyEvent');
    expect(data).toEqual({ a: 1 });
  });
});
