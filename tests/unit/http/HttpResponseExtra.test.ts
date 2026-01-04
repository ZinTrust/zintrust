import { createHttpResponse } from '@httpClient/HttpResponse';
import { describe, expect, it } from 'vitest';

const makeResponse = (status: number, headers: Record<string, string> = {}): Response => {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(Object.entries(headers)),
  } as any as Response;
};

describe('HttpResponse (extra tests)', () => {
  it('returns raw headers object', () => {
    const response = createHttpResponse(
      makeResponse(200, { 'Content-Type': 'application/json', 'X-Test': 'v' }),
      '{}'
    );

    const h = response.headers;
    expect(h['Content-Type']).toBe('application/json');
    expect(h['X-Test']).toBe('v');
  });

  it('text() returns raw body', () => {
    const response = createHttpResponse(makeResponse(200), 'plain text body');
    expect(response.text()).toBe('plain text body');
  });

  it('json() throws a validation error when body is invalid JSON', () => {
    const response = createHttpResponse(makeResponse(200), 'not-json');
    expect(() => response.json()).toThrow(/Failed to parse JSON response/);
  });
});
