import { TermiiDriver } from '@notification/drivers/Termii';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  });

  it('throws when fetch returns non-ok', async () => {
    process.env['TERMII_API_KEY'] = 'testkey';
    const fakeResp = { ok: false, status: 500, text: async () => 'error' } as any;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fakeResp)) as any);

    await expect(TermiiDriver.send('12345', 'hello')).rejects.toThrow();
  });
});
