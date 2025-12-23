import { XssProtection } from '@/security/XssProtection';
import { describe, expect, it } from 'vitest';

describe('XssProtection', () => {
  describe('escapeHtml', () => {
    it('should escape special characters', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;';
      expect(XssProtection.escape(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(XssProtection.escape('')).toBe('');
    });

    it('should handle non-string input', () => {
      // @ts-ignore
      expect(XssProtection.escape(null)).toBe('');
      // @ts-ignore
      expect(XssProtection.escape(undefined)).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('should handle non-string input', () => {
      // @ts-ignore
      expect(XssProtection.sanitize(null)).toBe('');
      // @ts-ignore
      expect(XssProtection.sanitize(undefined)).toBe('');
    });

    it('should remove script tags', () => {
      const input = '<div><script>alert(1)</script>Content</div>';
      expect(XssProtection.sanitize(input)).toBe('<div>Content</div>');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      expect(XssProtection.sanitize(input)).toBe('<div >Click me</div>');
    });

    it('should remove javascript: URIs', () => {
      const input = '<a href="javascript:alert(1)">Link</a>'; // nosonar
      expect(XssProtection.sanitize(input)).toBe('<a >Link</a>');
    });

    it('should remove iframe tags', () => {
      const input = '<div><iframe src="http://evil.com"></iframe></div>';
      expect(XssProtection.sanitize(input)).toBe('<div></div>');
    });

    it('should remove style tags', () => {
      const input = '<style>body { display: none; }</style>';
      expect(XssProtection.sanitize(input)).toBe('');
    });

    it('should remove form tags', () => {
      const input = '<form action="/login"><input type="text"></form>';
      expect(XssProtection.sanitize(input)).toBe('');
    });
  });

  describe('encodeUri', () => {
    it('should encode URI components', () => {
      const input = 'hello world?&';
      expect(XssProtection.encodeUri(input)).toBe('hello%20world%3F%26');
    });

    it('should return empty string and handle errors when encoding fails', () => {
      const original = globalThis.encodeURIComponent;
      // Force the catch branch deterministically.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      (
        globalThis as unknown as { encodeURIComponent: (value: string) => string }
      ).encodeURIComponent = () => {
        throw new Error('boom');
      };

      try {
        expect(XssProtection.encodeUri('ok')).toBe('');
      } finally {
        (
          globalThis as unknown as { encodeURIComponent: (value: string) => string }
        ).encodeURIComponent = original;
      }
    });

    it('should handle non-string input', () => {
      // @ts-ignore
      expect(XssProtection.encodeUri(null)).toBe('');
    });
  });

  describe('encodeHref', () => {
    it('should allow valid http URLs (escaped)', () => {
      const input = 'http://example.com';
      expect(XssProtection.encodeHref(input)).toBe('http:&#x2F;&#x2F;example.com');
    });

    it('should block javascript: URLs', () => {
      const input = 'javascript:alert(1)'; // NOSONAR: S1523 - Test case for blocking javascript: protocol
      expect(XssProtection.encodeHref(input)).toBe('');
    });

    it('should block javascript: URLs with whitespace', () => {
      const input = '  javascript:alert(1)'; // NOSONAR: S1523 - Test case for blocking javascript: protocol
      expect(XssProtection.encodeHref(input)).toBe('');
    });

    it('should block obfuscated javascript: URLs', () => {
      const input = 'java\tscript:alert(1)'; // NOSONAR: S1523 - Test case for blocking javascript: protocol
      expect(XssProtection.encodeHref(input)).toBe('');
    });

    it('should block data:text/html URLs', () => {
      const input = 'data:text/html,<b>x</b>'; // nosonar
      expect(XssProtection.encodeHref(input)).toBe('');
    });

    it('should handle non-string input', () => {
      // @ts-ignore
      expect(XssProtection.encodeHref(null)).toBe('');
    });
  });

  describe('isSafeUrl', () => {
    it('should allow relative URLs', () => {
      expect(XssProtection.isSafeUrl('/path')).toBe(true);
      expect(XssProtection.isSafeUrl('#hash')).toBe(true);
    });

    it('should allow http/https URLs', () => {
      expect(XssProtection.isSafeUrl('http://example.com')).toBe(true);
      expect(XssProtection.isSafeUrl('https://example.com')).toBe(true);
    });

    it('should allow URLs without protocol', () => {
      expect(XssProtection.isSafeUrl('example.com/path')).toBe(true);
    });

    it('should block other protocols and non-string input', () => {
      expect(XssProtection.isSafeUrl('ftp://example.com')).toBe(false);
      // @ts-ignore
      expect(XssProtection.isSafeUrl(null)).toBe(false);
    });
  });

  describe('escapeJson', () => {
    it('should escape JSON for safe embedding', () => {
      const out = XssProtection.escapeJson({ msg: '"<>&' });
      expect(out).toContain('&quot;');
      expect(out).toContain('&lt;');
      expect(out).toContain('&gt;');
      expect(out).toContain('&amp;');
    });
  });

  it('XssProtection object and aliases forward to functions', () => {
    expect(XssProtection.escape('<')).toBe('&lt;');
    expect(XssProtection.sanitize('<script>alert(1)</script>ok')).toBe('ok');
    expect(XssProtection.encodeHref('javascript:alert(1)')).toBe(''); // NOSONAR: S1523 - Test case for blocking javascript: protocol
    expect(XssProtection.isSafeUrl('/ok')).toBe(true);
    expect(XssProtection.escapeJson({ a: '<' })).toContain('&lt;');
  });
});
