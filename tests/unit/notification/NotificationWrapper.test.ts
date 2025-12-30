import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@notification/Service', () => ({
  NotificationService: {
    send: vi.fn().mockResolvedValue({ ok: true }),
    listDrivers: vi.fn().mockReturnValue(['console']),
  },
}));

import { Notification } from '@notification/Notification';
import { NotificationService } from '@notification/Service';

describe('Notification wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards send to NotificationService', async () => {
    const res = await Notification.send('abc', 'hello');
    expect(res).toEqual({ ok: true });
    expect(NotificationService.send).toHaveBeenCalledWith('abc', 'hello');
  });

  it('listDrivers forwards to registry', () => {
    const list = Notification.listDrivers();
    expect(list).toEqual(['console']);
    expect(NotificationService.listDrivers).toHaveBeenCalled();
  });
});
