import { validateUrl } from '@/security/UrlValidator';
import { Env } from '@config/env';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('UrlValidator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    // Since Env is an object with properties, we can spy on it or just modify it if it's mutable.
    // Looking at Env.ts, it exports const Env = { ... }. It's a plain object.
    // However, it's better to use vi.spyOn if possible, or just modify the property and restore it.

    // Since Env.NODE_ENV is a property, we can't spy on it directly like a method.
    // But we can modify the value.
    const originalEnv = Env.NODE_ENV;
    // @ts-ignore - bypassing readonly for testing
    Env.NODE_ENV = 'production';

    try {
      expect(() => validateUrl('https://evil.com')).toThrow(
        /URL hostname 'evil.com' is not allowed/
      );
    } finally {
      // @ts-ignore
      Env.NODE_ENV = originalEnv;
    }
  });

  it('should NOT throw error for disallowed domains in development', () => {
    const originalEnv = Env.NODE_ENV;
    // @ts-ignore
    Env.NODE_ENV = 'development';

    try {
      expect(() => validateUrl('https://evil.com')).not.toThrow();
    } finally {
      // @ts-ignore
      Env.NODE_ENV = originalEnv;
    }
  });

  it('should throw error for invalid URL format', () => {
    expect(() => validateUrl('not-a-url')).toThrow(/Invalid URL/);
  });
});
