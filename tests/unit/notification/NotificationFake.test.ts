import { describe, it, beforeEach } from 'vitest';
import NotificationFake from '@notification/testing';

describe('NotificationFake', () => {
  beforeEach(() => {
    NotificationFake.reset();
  });

  it('records sends and allows assertions', async () => {
    await NotificationFake.send('slack', { webhookUrl: 'u' }, { text: 'hi' });
    NotificationFake.assertSent((r) => r.provider === 'slack' && (r.payload as any).text === 'hi');
  });
});
