import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@broadcast/Broadcast', () => ({
  Broadcast: { publish: vi.fn(async () => ({ ok: true })) },
}));

import { sendBroadcast } from '@app/Toolkit/Broadcast/sendBroadcast';
import { Broadcast } from '@broadcast/Broadcast';

describe('Broadcast toolkit', () => {
  beforeEach(() => vi.resetAllMocks());

  it('delegates to Broadcast.publish', async () => {
    await sendBroadcast('ch', 'MyEvent', { a: 1 });
    expect((Broadcast.publish as any).mock.calls.length).toBe(1);
    expect((Broadcast.publish as any).mock.calls[0]?.[0]).toEqual({
      channel: 'ch',
      event: 'MyEvent',
      data: { a: 1 },
    });
  });
});
