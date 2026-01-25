import { Request } from '@http/Request';
import { IncomingMessage } from '@node-singletons/http';
import { Socket } from '@node-singletons/net';
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

    if ('url' in options) {
      req.url = options.url;
    } else {
      req.url = '/';
    }

    if ('method' in options) {
      req.method = options.method;
    } else {
      req.method = 'GET';
    }

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
    const req = Request.create(createMockRequest({ method: 'POST' }));
    expect(req.getMethod()).toBe('POST');
  });

  it('should default method to GET when missing', () => {
    const req = Request.create(createMockRequest({ method: undefined }));
    expect(req.getMethod()).toBe('GET');
  });

  it('should get path', () => {
    const req = Request.create(createMockRequest({ url: '/users?id=1' }));
    expect(req.getPath()).toBe('/users');
  });

  it('should default path to / when url missing', () => {
    const req = Request.create(createMockRequest({ url: undefined }));
    expect(req.getPath()).toBe('/');
  });

  it('should get headers', () => {
    const req = Request.create(
      createMockRequest({ headers: { 'content-type': 'application/json' } })
    );
    expect(req.getHeaders()).toEqual({ 'content-type': 'application/json' });
    expect(req.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('should get specific header', () => {
    const req = Request.create(
      createMockRequest({ headers: { 'Content-Type': 'application/json' } })
    );
    expect(req.getHeader('content-type')).toBe('application/json');
  });

  it('should parse query parameters', () => {
    const req = Request.create(createMockRequest({ url: '/users?id=1&tags=a&tags=b' }));
    expect(req.getQueryParam('id')).toBe('1');
    expect(req.getQueryParam('tags')).toEqual(['a', 'b']);
  });

  it('should return query object', () => {
    const req = Request.create(createMockRequest({ url: '/users?id=1' }));
    expect(req.getQuery()).toEqual({ id: '1' });
  });

  it('should accumulate repeated query parameters into an array', () => {
    const req = Request.create(createMockRequest({ url: '/users?tags=a&tags=b&tags=c' }));
    expect(req.getQueryParam('tags')).toEqual(['a', 'b', 'c']);
  });

  it('should manage route parameters', () => {
    const req = Request.create(createMockRequest());
    req.setParams({ id: '123' });
    expect(req.getParams()).toEqual({ id: '123' });
    expect(req.getParam('id')).toBe('123');
  });

  it('should manage body', () => {
    const req = Request.create(createMockRequest());
    const body = { foo: 'bar' };
    req.setBody(body);
    expect(req.getBody()).toBe(body);
  });

  it('should check if request is JSON', () => {
    const jsonReq = Request.create(
      createMockRequest({ headers: { 'content-type': 'application/json' } })
    );
    expect(jsonReq.isJson()).toBe(true);

    const htmlReq = Request.create(createMockRequest({ headers: { 'content-type': 'text/html' } }));
    expect(htmlReq.isJson()).toBe(false);
  });

  it('should get raw request', () => {
    const rawReq = createMockRequest();
    const req = Request.create(rawReq);
    expect(req.getRaw()).toBe(rawReq);
  });

  describe('data helpers', () => {
    it('should merge data with precedence: body > params > query', () => {
      const req = Request.create(createMockRequest({ url: '/users?query=value' }));
      req.setParams({ param: 'value' });
      req.setBody({ body: 'value' });

      const data = req.data();
      expect(data).toEqual({
        query: 'value',
        param: 'value',
        body: 'value',
      });
    });

    it('should cache data result', () => {
      const req = Request.create(createMockRequest());
      req.setParams({ id: '123' });

      const data1 = req.data();
      const data2 = req.data();
      expect(data1).toBe(data2); // Same reference (cached)
    });

    it('should get typed value with default', () => {
      const req = Request.create(createMockRequest());
      req.setParams({ count: '42' });

      expect(req.get('count')).toBe('42');
      expect(req.get('missing', 'default')).toBe('default');
      expect(req.get<number>('count')).toBe('42');
      expect(req.get<number>('missing', 0)).toBe(0);
    });

    it('should handle empty data gracefully', () => {
      const req = Request.create(createMockRequest());
      const data = req.data();
      expect(data).toEqual({});
      expect(req.get('missing', 'fallback')).toBe('fallback');
    });
  });
});
