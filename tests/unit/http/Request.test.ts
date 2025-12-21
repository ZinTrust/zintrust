import { Request } from '@http/Request';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';

describe('Request', () => {
  const createMockRequest = (
    options: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
    } = {}
  ): IncomingMessage => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.url = options.url ?? '/';
    req.method = options.method ?? 'GET';

    // Simulate Node.js behavior of lowercasing headers
    const headers: Record<string, string> = {};
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers[key.toLowerCase()] = value;
      }
    }
    req.headers = headers;

    return req;
  };

  it('should get method', () => {
    const req = new Request(createMockRequest({ method: 'POST' }));
    expect(req.getMethod()).toBe('POST');
  });

  it('should get path', () => {
    const req = new Request(createMockRequest({ url: '/users?id=1' }));
    expect(req.getPath()).toBe('/users');
  });

  it('should get headers', () => {
    const req = new Request(createMockRequest({ headers: { 'content-type': 'application/json' } }));
    expect(req.getHeaders()).toEqual({ 'content-type': 'application/json' });
    expect(req.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('should get specific header', () => {
    const req = new Request(createMockRequest({ headers: { 'Content-Type': 'application/json' } }));
    expect(req.getHeader('content-type')).toBe('application/json');
  });

  it('should parse query parameters', () => {
    const req = new Request(createMockRequest({ url: '/users?id=1&tags=a&tags=b' }));
    expect(req.getQueryParam('id')).toBe('1');
    expect(req.getQueryParam('tags')).toEqual(['a', 'b']);
  });

  it('should manage route parameters', () => {
    const req = new Request(createMockRequest());
    req.setParams({ id: '123' });
    expect(req.getParams()).toEqual({ id: '123' });
    expect(req.getParam('id')).toBe('123');
  });

  it('should manage body', () => {
    const req = new Request(createMockRequest());
    const body = { foo: 'bar' };
    req.setBody(body);
    expect(req.getBody()).toBe(body);
  });

  it('should check if request is JSON', () => {
    const jsonReq = new Request(
      createMockRequest({ headers: { 'content-type': 'application/json' } })
    );
    expect(jsonReq.isJson()).toBe(true);

    const htmlReq = new Request(createMockRequest({ headers: { 'content-type': 'text/html' } }));
    expect(htmlReq.isJson()).toBe(false);
  });

  it('should get raw request', () => {
    const rawReq = createMockRequest();
    const req = new Request(rawReq);
    expect(req.getRaw()).toBe(rawReq);
  });
});
