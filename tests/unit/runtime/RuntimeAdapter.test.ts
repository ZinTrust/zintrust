import { describe, expect, it, vi } from 'vitest';

import { createMockHttpObjects, ErrorResponse, HttpResponse } from '@/runtime/RuntimeAdapter';

describe('RuntimeAdapter helpers', () => {
  describe('HttpResponse', () => {
    it('should have sensible defaults', () => {
      const res = HttpResponse.create();
      expect(res.statusCode).toBe(200);
      expect(res.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(res.body).toBeNull();
      expect(res.isBase64Encoded).toBe(false);

      expect(res.toResponse()).toEqual({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: undefined,
        isBase64Encoded: false,
      });
    });

    it('should set status and allow chaining', () => {
      const res = HttpResponse.create();
      expect(res.setStatus(201)).toBe(res);
      expect(res.statusCode).toBe(201);
    });

    it('should set a header', () => {
      const res = HttpResponse.create();
      res.setHeader('X-Test', '1');
      expect(res.headers['X-Test']).toBe('1');
    });

    it('should merge headers (preserving existing)', () => {
      const res = HttpResponse.create();
      res.setHeader('X-A', 'a');
      res.setHeaders({ 'X-B': ['b1', 'b2'], 'Content-Type': 'text/plain' });

      expect(res.headers).toEqual({
        'Content-Type': 'text/plain',
        'X-A': 'a',
        'X-B': ['b1', 'b2'],
      });
    });

    it('should set body with base64 flag defaulting to false', () => {
      const res = HttpResponse.create();
      res.setBody('hello');
      expect(res.body).toBe('hello');
      expect(res.isBase64Encoded).toBe(false);
    });

    it('should set body and base64 flag explicitly', () => {
      const res = HttpResponse.create();
      const data = Buffer.from('abc');
      res.setBody(data, true);
      expect(res.body).toBe(data);
      expect(res.isBase64Encoded).toBe(true);

      expect(res.toResponse()).toEqual({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: data,
        isBase64Encoded: true,
      });
    });

    it('should set JSON body and content-type', () => {
      const res = HttpResponse.create();
      res.setJSON({ ok: true, n: 1 });

      expect(res.headers['Content-Type']).toBe('application/json');
      expect(res.body).toBe(JSON.stringify({ ok: true, n: 1 }));
      expect(res.isBase64Encoded).toBe(false);
    });

    it('should allow direct property assignment via setters', () => {
      const res = HttpResponse.create();
      res.statusCode = 418;
      res.headers = { 'X-Test': '1' };
      res.body = 'hi';
      res.isBase64Encoded = true;

      expect(res.toResponse()).toEqual({
        statusCode: 418,
        headers: { 'X-Test': '1' },
        body: 'hi',
        isBase64Encoded: true,
      });
    });
  });

  describe('createMockHttpObjects', () => {
    it('should create req/res and capture response data', () => {
      const { req, res, responseData } = createMockHttpObjects({
        method: 'GET',
        path: '/hello',
        headers: { 'x-a': '1' },
        remoteAddr: '1.2.3.4', //NOSONAR
      });

      expect(req).toEqual({
        method: 'GET',
        url: '/hello',
        headers: { 'x-a': '1' },
        remoteAddress: '1.2.3.4', //NOSONAR
      });

      // writeHead merges headers
      (
        res as unknown as { writeHead: (code: number, headers?: Record<string, string>) => object }
      ).writeHead(201, { 'X-From-Head': 'yes' });
      expect(responseData.statusCode).toBe(201);
      expect(responseData.headers['X-From-Head']).toBe('yes');

      // setHeader lowercases name
      (res as unknown as { setHeader: (name: string, value: string) => object }).setHeader(
        'X-Test',
        '2'
      );
      expect(responseData.headers['x-test']).toBe('2');

      // end/write write the body
      (res as unknown as { end: (chunk?: string | Buffer) => object }).end('done');
      expect(responseData.body).toBe('done');

      (res as unknown as { write: (chunk: string | Buffer) => boolean }).write(Buffer.from('x'));
      expect(String(responseData.body)).toContain('x');
    });
  });

  describe('ErrorResponse', () => {
    it('should build an error response without details', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

      const res = ErrorResponse.create(400, 'Bad Request');
      const parsed = JSON.parse(String(res.body));

      expect(res.statusCode).toBe(400);
      expect(parsed).toEqual({
        error: 'Bad Request',
        statusCode: 400,
        timestamp: '2025-01-01T00:00:00.000Z',
      });

      vi.useRealTimers();
    });

    it('should include details when provided', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

      const res = ErrorResponse.create(500, 'Oops', { code: 'E_FAIL' });
      const parsed = JSON.parse(String(res.body));

      expect(parsed).toEqual({
        error: 'Oops',
        statusCode: 500,
        timestamp: '2025-01-01T00:00:00.000Z',
        details: { code: 'E_FAIL' },
      });

      vi.useRealTimers();
    });
  });
});
