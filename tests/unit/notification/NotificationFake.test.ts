/* eslint-disable max-nested-callbacks */
import NotificationFake from '@notification/testing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('NotificationFake', () => {
  beforeEach(() => {
    NotificationFake.reset();
  });

  it('lastSent returns undefined when empty', () => {
    expect(NotificationFake.lastSent()).toBeUndefined();
  });

  it('records sends and allows assertions', async () => {
    await NotificationFake.send('slack', { webhookUrl: 'u' }, { text: 'hi' });

    expect(() =>
      NotificationFake.assertSent(
        (r: { provider: string; payload: any }) =>
          r.provider === 'slack' && (r.payload as any).text === 'hi'
      )
    ).not.toThrow();

    expect(NotificationFake.getSent()).toHaveLength(1);
  });

  it('supports negative assertions and count helpers', async () => {
    NotificationFake.assertSentCount(0);

    await NotificationFake.send('termii', { sender: 's' }, { text: 'hello' });

    NotificationFake.assertSentCount(1);
    NotificationFake.assertNotSent((r: { provider: string }) => r.provider === 'slack');

    const last = NotificationFake.lastSent();
    expect(last?.provider).toBe('termii');
    expect(NotificationFake.getSent().length).toBe(1);
  });

  it('throws helpful validation errors when expectations are not met', async () => {
    expect(() => NotificationFake.assertSentCount(1)).toThrow(/Unexpected notification send count/);

    expect(() => NotificationFake.assertSent(() => true)).toThrow(
      /Expected notification to be sent/
    );
    expect(() => NotificationFake.assertNotSent(() => true)).not.toThrow();

    await NotificationFake.send('slack', { webhookUrl: 'u' }, { text: 'hi' });

    expect(() => NotificationFake.assertSentCount(0)).toThrow(/Unexpected notification send count/);
    expect(() => NotificationFake.assertSent(() => true)).not.toThrow();
    expect(() => NotificationFake.assertNotSent(() => true)).toThrow(
      /Expected notification to NOT be sent/
    );
  });
});
