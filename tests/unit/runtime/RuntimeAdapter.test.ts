import { describe, expect, it, vi } from 'vitest';

import { ErrorResponse, HttpResponse } from '@/runtime/RuntimeAdapter';

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
