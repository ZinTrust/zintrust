import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock Env to allow NODE_ENV manipulation for testing
vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((key: string, defaultValue?: string) => defaultValue || ''),
    getInt: vi.fn((key: string, defaultValue?: number) => defaultValue || 0),
    getBool: vi.fn((key: string, defaultValue?: boolean) => defaultValue || false),
    NODE_ENV: 'development',
    PORT: 3000,
  },
}));

// Import mocked Env after vi.mock
import { validateUrl } from '@/security/UrlValidator';
import { Env } from '@config/env';

describe('UrlValidator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset NODE_ENV after each test
    (Env as any).NODE_ENV = 'development';
  });

  it('should allow localhost by default', () => {
    expect(() => validateUrl('http://localhost:3000/api')).not.toThrow();
    expect(() => validateUrl('http://127.0.0.1:8080')).not.toThrow();
  });

  it('should allow allowed domains', () => {
    const allowed = ['example.com'];
    expect(() => validateUrl('https://example.com/page', allowed)).not.toThrow();
  });

  it('should allow subdomains of allowed domains', () => {
    const allowed = ['example.com'];
    expect(() => validateUrl('https://api.example.com/v1', allowed)).not.toThrow();
  });

  it('should throw error for disallowed domains in production', () => {
    // Mock Env.NODE_ENV to 'production'
    (Env as any).NODE_ENV = 'production';

    try {
      expect(() => validateUrl('https://evil.com')).toThrow(
        /URL hostname 'evil.com' is not allowed/
      );
    } finally {
      // Reset in afterEach
    }
  });

  it('should NOT throw error for disallowed domains in development', () => {
    (Env as any).NODE_ENV = 'development';

    try {
      expect(() => validateUrl('https://evil.com')).not.toThrow();
    } finally {
      // Reset in afterEach
    }
  });

  it('should throw error for invalid URL format', () => {
    expect(() => validateUrl('not-a-url')).toThrow(/Invalid URL/);
  });
});
