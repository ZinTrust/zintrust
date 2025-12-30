import { afterEach, describe, expect, it, vi } from 'vitest';

import TwilioDefault, { TwilioDriver, sendSms } from '@tools/notification/drivers/Twilio';

describe('TwilioDriver extra coverage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws CONFIG_ERROR when accountSid is missing', async () => {
    await expect(
      TwilioDriver.send(
        { accountSid: '', authToken: 't', from: '+100' },
        { to: '+200', body: 'hi' }
      )
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('throws CONFIG_ERROR when authToken is missing', async () => {
    await expect(
      TwilioDriver.send(
        { accountSid: 'sid', authToken: '   ', from: '+100' },
        { to: '+200', body: 'hi' }
      )
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('throws CONFIG_ERROR when from is missing', async () => {
    await expect(
      TwilioDriver.send({ accountSid: 'sid', authToken: 't', from: '' }, { to: '+200', body: 'hi' })
    ).rejects.toHaveProperty('code', 'CONFIG_ERROR');
  });

  it('throws VALIDATION_ERROR when to is missing', async () => {
    await expect(
      TwilioDriver.send(
        { accountSid: 'sid', authToken: 't', from: '+100' },
        { to: '   ', body: 'hi' }
      )
    ).rejects.toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('throws CONNECTION_ERROR when Twilio returns non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'nope',
      }))
    );

    await expect(
      TwilioDriver.send(
        { accountSid: 'sid', authToken: 'token', from: '+100' },
        { to: '+200', body: 'hi' }
      )
    ).rejects.toHaveProperty('code', 'CONNECTION_ERROR');
  });

  it('sends urlencoded payload and returns ok on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await TwilioDriver.send(
      { accountSid: 'sid', authToken: 'token', from: '+100' },
      { to: '+200', body: 'hello' }
    );

    expect(res).toEqual({ ok: true, status: 201 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = (fetchMock as any).mock.calls as any[];
    expect(calls.length).toBe(1);
    const url = calls[0][0];
    const init = calls[0][1] as any;
    expect(String(url)).toContain('https://api.twilio.com/2010-04-01/Accounts/sid/Messages.json');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(init.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(String(init.body)).toContain('To=%2B200');
    expect(String(init.body)).toContain('From=%2B100');
    expect(String(init.body)).toContain('Body=hello');
  });

  it('sendSms delegates to TwilioDriver.send', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendSms({ accountSid: 'sid', authToken: 'token', from: '+100' }, { to: '+200', body: 'hi' })
    ).resolves.toEqual({ ok: true, status: 200 });

    // touch default export too
    expect(TwilioDefault).toBe(TwilioDriver);
  });
});
