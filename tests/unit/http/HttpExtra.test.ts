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

  it('asForm serializes plain-object bodies as form data', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(init.body).toBeInstanceOf(URLSearchParams);
      expect(init.body.toString()).toBe('grant_type=client_credentials&scope=openid');
      return {
        status: 200,
        ok: true,
        text: async () => '{}',
        headers: new Map(),
      } as any as Response;
    });

    // @ts-ignore
    vi.stubGlobal('fetch', fetchMock);

    await HttpClient.post('https://example.com', {
      grant_type: 'client_credentials',
      scope: 'openid',
    })
      .asForm()
      .send();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('asForm preserves URLSearchParams bodies', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(init.body).toBeInstanceOf(URLSearchParams);
      expect(init.body.toString()).toBe('client_id=abc&client_secret=def');

      return {
        status: 200,
        ok: true,
        text: async () => '{}',
        headers: new Map(),
      } as any as Response;
    });

    vi.stubGlobal('fetch', fetchMock as any);

    await HttpClient.post(
      'https://example.com',
      new URLSearchParams({ client_id: 'abc', client_secret: 'def' })
    )
      .asForm()
      .send();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('delete with data sets JSON content-type and sends the body', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.body).toBe('{"foo":"bar"}');

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

  it('asCustom lets callers define a custom body serializer and content type', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      expect(init.headers['Content-Type']).toBe('text/plain');
      expect(init.body).toBe('mode=custom&payload=%7B%22foo%22%3A%22bar%22%7D');

      return {
        status: 200,
        ok: true,
        text: async () => '{}',
        headers: new Map(),
      } as any as Response;
    });

    vi.stubGlobal('fetch', fetchMock as any);

    await HttpClient.post('https://example.com', { foo: 'bar' })
      .asCustom({
        contentType: 'text/plain',
        serializeBody: (body) => {
          const payload =
            body instanceof URLSearchParams ? body.toString() : JSON.stringify(body ?? {});
          return 'mode=custom&payload=' + encodeURIComponent(payload);
        },
      })
      .send();

    expect(fetchMock).toHaveBeenCalled();
  });
});
