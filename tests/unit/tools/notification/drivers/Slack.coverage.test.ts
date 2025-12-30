import { afterEach, describe, expect, it, vi } from 'vitest';

import SlackDefault, { SlackDriver, sendSlackWebhook } from '@tools/notification/drivers/Slack';

describe('SlackDriver extra coverage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws CONFIG_ERROR when webhookUrl is missing', async () => {
    await expect(SlackDriver.send({ webhookUrl: '' }, { text: 'hi' })).rejects.toHaveProperty(
      'code',
      'CONFIG_ERROR'
    );
  });

  it('throws CONNECTION_ERROR when webhook returns non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => 'bad',
      }))
    );

    await expect(
      SlackDriver.send({ webhookUrl: 'https://hooks.slack.test/x' }, { text: 'hi' })
    ).rejects.toHaveProperty('code', 'CONNECTION_ERROR');
  });

  it('POSTs JSON and returns ok on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      SlackDriver.send({ webhookUrl: 'https://hooks.slack.test/x' }, { text: 'hi' })
    ).resolves.toEqual({ ok: true, status: 200 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = (fetchMock as any).mock.calls as any[];
    expect(calls.length).toBe(1);
    const url = calls[0][0];
    const init = calls[0][1] as any;
    expect(String(url)).toBe('https://hooks.slack.test/x');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ text: 'hi' }));
  });

  it('sendSlackWebhook delegates to SlackDriver.send', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendSlackWebhook({ webhookUrl: 'https://hooks.slack.test/x' }, { text: 'hi' })
    ).resolves.toEqual({ ok: true, status: 204 });

    // touch default export too
    expect(SlackDefault).toBe(SlackDriver);
  });
});
