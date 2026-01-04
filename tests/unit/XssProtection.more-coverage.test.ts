import { afterEach, describe, expect, it, vi } from 'vitest';

describe('XssProtection additional coverage', () => {
  afterEach(() => {
    vi.doUnmock('@config/logger');
    vi.resetModules();
  });

  it('encodeUri returns empty string when encoder throws (and logs)', async () => {
    vi.resetModules();

    const loggerError = vi.fn();
    vi.doMock('@config/logger', () => ({
      Logger: {
        error: loggerError,
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const originalEncodeURIComponent = globalThis.encodeURIComponent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).encodeURIComponent = () => {
      throw new Error('boom');
    };

    try {
      const { XssProtection } = await import('@security/XssProtection');
      expect(XssProtection.encodeUri('hello')).toBe('');
      expect(loggerError).toHaveBeenCalled();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).encodeURIComponent = originalEncodeURIComponent;
    }
  });

  it('encodeHref blocks percent-encoded and double-encoded javascript: obfuscations', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    // NOSONAR: S1523 - test case for blocking javascript: protocol
    const percentEncoded = '%6a%61%76%61%73%63%72%69%70%74%3aalert(1)';
    expect(XssProtection.encodeHref(percentEncoded)).toBe('');

    // NOSONAR: S1523 - test case for blocking javascript: protocol
    const doubleEncoded = '%256a%2561%2576%2561%2573%2563%2572%2569%2570%2574%253aalert(1)';
    expect(XssProtection.encodeHref(doubleEncoded)).toBe('');
  });

  it('encodeHref blocks javascript: when split with named HTML entities', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    // NOSONAR: S1523 - test case for blocking javascript: protocol
    expect(XssProtection.encodeHref('java&tab;script:alert(1)')).toBe('');

    // NOSONAR: S1523 - test case for blocking javascript: protocol
    expect(XssProtection.encodeHref('java&newline;script:alert(1)')).toBe('');

    // NOSONAR: S1523 - test case for blocking javascript: protocol
    expect(XssProtection.encodeHref('java&nbsp;script:alert(1)')).toBe('');
  });

  it('encodeHref handles invalid numeric entities without throwing', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    // Large code point triggers the guard branch in decodeCodePoint.
    const weird = 'http://example.com/?q=&#99999999;';
    expect(XssProtection.encodeHref(weird)).toContain('http:');
  });

  it('encodeHref blocks javascript: when split with decimal numeric entities', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    // NOSONAR: S1523 - test case for blocking javascript: protocol
    expect(XssProtection.encodeHref('jav&#97;script:alert(1)')).toBe('');
  });

  it('encodeHref tolerates percent-decoding errors and preserves original href', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    const invalidPercent = 'http://example.com/%E0%A4%A';
    const out = XssProtection.encodeHref(invalidPercent);
    expect(out).toContain('http:');
    expect(out).toContain('%E0%A4%A');
  });

  it('encodeHref escapes and returns relative URLs and fragments', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    const out = XssProtection.encodeHref('/a/b?x=1&y=2');
    expect(out).toContain('&amp;');
    expect(out).toContain('&#x2F;');
  });

  it('decodeCodePoint returns empty string on fromCodePoint failure (via monkey patch)', async () => {
    const originalFromCodePoint = String.fromCodePoint;

    try {
      // Force the internal try/catch branch to execute.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (String as any).fromCodePoint = () => {
        throw new Error('boom');
      };

      const { XssProtection } = await import('@security/XssProtection');

      // This would normally decode to javascript: and be blocked, but with fromCodePoint failing
      // the entity decode returns the original entity, so it is not normalized to javascript:.
      const out = XssProtection.encodeHref('jav&#97;script:alert(1)');
      expect(out).not.toBe('');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (String as any).fromCodePoint = originalFromCodePoint;
    }
  });

  it('encodeHref scheme allowlist blocks unknown schemes', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    expect(XssProtection.encodeHref('ftp://example.com/file')).toBe('');
  });

  it('encodeHref and sanitize allow safe data:image/avif but remove unsafe URL attributes', async () => {
    const { XssProtection } = await import('@security/XssProtection');

    const safeDataImage = 'data:image/avif;base64,AAAA';
    const encodedSafeDataImage = XssProtection.encodeHref(safeDataImage);
    expect(encodedSafeDataImage).toContain('data:image');
    expect(encodedSafeDataImage).toContain('avif');

    const unsafeHtml = '<a href="%6a%61%76%61%73%63%72%69%70%74%3aalert(1)">x</a>'; // NOSONAR: S1523
    const unsafeOut = XssProtection.sanitize(unsafeHtml);
    expect(unsafeOut).not.toContain('href');

    const safeHtml = '<img src="data:image/avif;base64,AAAA" />';
    const safeOut = XssProtection.sanitize(safeHtml);
    expect(safeOut).toContain('src="data:image/avif');
  });
});
