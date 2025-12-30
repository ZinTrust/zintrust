import NotificationFake from '@notification/testing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('NotificationFake', () => {
  beforeEach(() => {
    NotificationFake.reset();
  });

  it('records sends and allows assertions', async () => {
    await NotificationFake.send('slack', { webhookUrl: 'u' }, { text: 'hi' });
    NotificationFake.assertSent((r) => r.provider === 'slack' && (r.payload as any).text === 'hi');
  });

  it('supports negative assertions and count helpers', async () => {
    NotificationFake.assertSentCount(0);

    await NotificationFake.send('termii', { sender: 's' }, { text: 'hello' });

    NotificationFake.assertSentCount(1);
    NotificationFake.assertNotSent((r) => r.provider === 'slack');

    const last = NotificationFake.lastSent();
    expect(last?.provider).toBe('termii');
    expect(NotificationFake.getSent().length).toBe(1);
  });
});
