import { TermiiDriver } from '@notification/drivers/Termii';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitHttpClient } = vi.hoisted(() => ({
  emitHttpClient: vi.fn(),
}));

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitHttpClient,
  },
}));

describe('Termii Driver', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['TERMII_API_KEY'];
  });

  it('throws when missing recipient or message', async () => {
    await expect(TermiiDriver.send('', 'hi')).rejects.toThrow();
    await expect(TermiiDriver.send('12345', '')).rejects.toThrow();
  });

  it('throws when API key missing', async () => {
    await expect(TermiiDriver.send('12345', 'hi')).rejects.toThrow();
  });

  it('sends successfully when fetch ok', async () => {
    process.env['TERMII_API_KEY'] = 'testkey';
    const fakeResp = { ok: true, json: async () => ({ messageId: 'abc' }) } as any;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fakeResp)) as any);

    const out = await TermiiDriver.send('12345', 'hello');
    expect(out).toEqual({ messageId: 'abc' });
    expect(emitHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'termii',
        method: 'POST',
        url: 'https://api.termii.com/sms/send',
        responseStatus: undefined,
        duration: expect.any(Number),
        requestBody: expect.objectContaining({
          to: '12345',
          sms: 'hello',
          api_key: 'testkey',
        }),
      })
    );
  });

  it('throws when fetch returns non-ok', async () => {
    process.env['TERMII_API_KEY'] = 'testkey';
    const fakeResp = { ok: false, status: 500, text: async () => 'error' } as any;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fakeResp)) as any);

    await expect(TermiiDriver.send('12345', 'hello')).rejects.toThrow();
  });
});
