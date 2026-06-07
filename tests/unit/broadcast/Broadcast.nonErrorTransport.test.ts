import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/broadcast', () => ({
  default: {
    getDriverName: vi.fn(),
    getDriverConfig: vi.fn(),
  },
}));

vi.mock('@broadcast/drivers/InMemory', () => ({ InMemoryDriver: { send: vi.fn() } }));

import Broadcast from '@/tools/broadcast/Broadcast';
import { InMemoryDriver } from '@broadcast/drivers/InMemory';
import broadcastConfig from '@config/broadcast';

beforeEach(() => vi.clearAllMocks());

describe('Broadcast non-Error transport handling', () => {
  it('handles auto mode with socket fallback', async () => {
    (broadcastConfig.getDriverName as any).mockReturnValue('auto');
    (broadcastConfig.getDriverConfig as any).mockReturnValue({ driver: 'auto' });
    (InMemoryDriver.send as any).mockResolvedValue({ ok: true, provider: 'inmemory' });

    const res = await Broadcast.send('c', 'e', {});
    expect(res).toBeDefined();
  });
});
