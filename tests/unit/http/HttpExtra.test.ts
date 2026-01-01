import { HttpClient } from '@/tools/http/Http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('HttpClient (extra tests)', () => {
  it('throws connection error on AbortError from fetch', async () => {
    // Mock fetch to throw an AbortError
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    // @ts-ignore
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abortErr;
      })
    );

    await expect(HttpClient.get('https://example.com').withTimeout(123).send()).rejects.toThrow(
      /HTTP request timeout after 123ms/
    );
  });

  it('asForm sets content-type header when sending', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      // Ensure header was set
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      return {
        status: 200,
        ok: true,
        text: async () => '{}',
        headers: new Map(),
      } as any as Response;
    });

    // @ts-ignore
    vi.stubGlobal('fetch', fetchMock);

    await HttpClient.get('https://example.com').asForm().send();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('delete with data sets JSON content-type (body not sent for DELETE)', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['Content-Type']).toBe('application/json');
      // DELETE does not set body in this implementation
      expect(init.body).toBeUndefined();

      return {
        status: 200,
        ok: true,
        text: async () => '{}',
        headers: new Map(),
      } as any as Response;
    });

    // @ts-ignore
    vi.stubGlobal('fetch', fetchMock);

    await HttpClient.delete('https://example.com', { foo: 'bar' }).send();
    expect(fetchMock).toHaveBeenCalled();
  });
});
