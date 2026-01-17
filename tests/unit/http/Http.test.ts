/**
 * HTTP Client Tests
 * Tests for fluent HTTP request builder and response handling
 */

import { HttpClient } from '@httpClient/Http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Http Client', () => {
  beforeEach(() => {
    // Mock fetch for all tests
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET requests', () => {
    it('should make GET request', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        text: vi.fn().mockResolvedValue('{"id": 1, "name": "Test"}'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const response = await HttpClient.get('https://api.example.com/users/1').send();

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.body).toBe('{"id": 1, "name": "Test"}');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users/1',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should parse JSON response', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        text: vi.fn().mockResolvedValue('{"id": 1, "name": "Alice"}'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const response = await HttpClient.get('https://api.example.com/users/1').send();
      const data = response.json<{ id: number; name: string }>();

      expect(data.id).toBe(1);
      expect(data.name).toBe('Alice');
    });

    it('should set User-Agent header by default', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.get('https://api.example.com/users').send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.headers).toHaveProperty('User-Agent', 'ZinTrust/1.0');
    });
  });

  describe('POST requests', () => {
    it('should make POST request with data', async () => {
      const mockResponse = {
        status: 201,
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        text: vi.fn().mockResolvedValue('{"id": 2, "name": "New User"}'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const response = await HttpClient.post('https://api.example.com/users', {
        name: 'New User',
        email: 'user@example.com',
      }).send();

      expect(response.status).toBe(201);
      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.body).toBe('{"name":"New User","email":"user@example.com"}');
      expect(init?.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should set Content-Type to application/json for POST', async () => {
      const mockResponse = {
        status: 201,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue('{}'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.post('https://api.example.com/users', { name: 'Test' }).send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.headers).toHaveProperty('Content-Type', 'application/json');
    });
  });

  describe('Fluent API', () => {
    it('should chain withHeader()', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.get('https://api.example.com/users')
        .withHeader('X-Custom-Header', 'custom-value')
        .withHeader('X-Another', 'another-value')
        .send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.headers).toMatchObject({
        'X-Custom-Header': 'custom-value',
        'X-Another': 'another-value',
      });
    });

    it('should chain withHeaders()', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.get('https://api.example.com/users')
        .withHeaders({
          'X-API-Key': 'secret-key',
          'X-Request-ID': '12345',
        })
        .send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.headers).toMatchObject({
        'X-API-Key': 'secret-key',
        'X-Request-ID': '12345',
      });
    });

    it('should chain withAuth() with Bearer token', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.get('https://api.example.com/users')
        .withAuth('my-secret-token', 'Bearer')
        .send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.headers).toHaveProperty('Authorization', 'Bearer my-secret-token');
    });

    it('should chain withBasicAuth()', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.get('https://api.example.com/users')
        .withBasicAuth('user', 'password')
        .send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      const expectedAuth = Buffer.from('user:password').toString('base64');
      expect(init?.headers).toHaveProperty('Authorization', `Basic ${expectedAuth}`);
    });
  });

  describe('Response status helpers', () => {
    it('should determine response status correctly', async () => {
      // Success response
      let mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      let response = await HttpClient.get('https://api.example.com/users').send();
      expect(response.successful).toBe(true);
      expect(response.failed).toBe(false);
      expect(response.clientError).toBe(false);
      expect(response.serverError).toBe(false);

      // Client error response
      mockResponse = {
        status: 404,
        ok: false,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      response = await HttpClient.get('https://api.example.com/notfound').send();
      expect(response.successful).toBe(false);
      expect(response.failed).toBe(true);
      expect(response.clientError).toBe(true);
      expect(response.serverError).toBe(false);

      // Server error response
      mockResponse = {
        status: 500,
        ok: false,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      response = await HttpClient.get('https://api.example.com/error').send();
      expect(response.successful).toBe(false);
      expect(response.failed).toBe(true);
      expect(response.clientError).toBe(false);
      expect(response.serverError).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      await expect(HttpClient.get('https://api.example.com/users').send()).rejects.toThrow(
        'HTTP request failed'
      );
    });

    it('should handle JSON parsing errors', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue('invalid json'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const response = await HttpClient.get('https://api.example.com/users').send();

      let thrown: unknown;
      try {
        response.json();
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain('Failed to parse JSON response');
    });
  });

  describe('HTTP methods', () => {
    it('should support PUT method', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue('{}'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.put('https://api.example.com/users/1', { name: 'Updated' }).send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.method).toBe('PUT');
    });

    it('should support PATCH method', async () => {
      const mockResponse = {
        status: 200,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue('{}'),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.patch('https://api.example.com/users/1', { name: 'Updated' }).send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.method).toBe('PATCH');
    });

    it('should support DELETE method', async () => {
      const mockResponse = {
        status: 204,
        ok: true,
        headers: new Map(),
        text: vi.fn().mockResolvedValue(''),
      };

      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await HttpClient.delete('https://api.example.com/users/1').send();

      const [, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(init?.method).toBe('DELETE');
    });
  });
});
