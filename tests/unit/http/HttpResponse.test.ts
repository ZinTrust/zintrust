/**
 * HttpResponse wrapper tests
 */

import { createHttpResponse } from '@httpClient/HttpResponse';
import { describe, expect, it } from 'vitest';

const makeResponse = (status: number, headers: Record<string, string> = {}): Response => {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries(headers)),
  } as any as Response;
};

describe('HttpResponse', () => {
  it('provides header helpers (case-insensitive)', () => {
    const response = createHttpResponse(
      makeResponse(200, { 'Content-Type': 'application/json' }),
      '{}'
    );

    expect(response.hasHeader('content-type')).toBe(true);
    expect(response.hasHeader('Content-Type')).toBe(true);
    expect(response.header('content-type')).toBe('application/json');
    expect(response.header('Content-Type')).toBe('application/json');
  });

  it('throwIfClientError throws on 4xx', () => {
    const response = createHttpResponse(makeResponse(404), 'not found');

    expect(() => response.throwIfClientError()).toThrow('HTTP client error: 404');
  });

  it('throwIfClientError returns self on non-4xx', () => {
    const response = createHttpResponse(makeResponse(200), 'ok');

    expect(response.throwIfClientError()).toBe(response);
  });

  it('throwIfServerError throws on 5xx', () => {
    const response = createHttpResponse(makeResponse(500), 'server error');

    expect(() => response.throwIfServerError()).toThrow('HTTP server error: 500');
  });

  it('throwIfServerError returns self on non-5xx', () => {
    const response = createHttpResponse(makeResponse(204), '');

    expect(response.throwIfServerError()).toBe(response);
  });
});
