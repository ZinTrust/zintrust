import { encodeHref, encodeUri, escapeHtml, sanitizeHtml } from '@/security/XssProtection';
import { describe, expect, it } from 'vitest';

describe('XssProtection', () => {
  describe('escapeHtml', () => {
    it('should escape special characters', () => {
      const input = '<script>alert("xss")</script>';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle non-string input', () => {
      // @ts-ignore
      expect(escapeHtml(null)).toBe('');
      // @ts-ignore
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('should remove script tags', () => {
      const input = '<div><script>alert(1)</script>Content</div>';
      expect(sanitizeHtml(input)).toBe('<div>Content</div>');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      expect(sanitizeHtml(input)).toBe('<div >Click me</div>');
    });

    it('should remove javascript: URIs', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      expect(sanitizeHtml(input)).toBe('<a >Link</a>');
    });

    it('should remove iframe tags', () => {
      const input = '<div><iframe src="http://evil.com"></iframe></div>';
      expect(sanitizeHtml(input)).toBe('<div></div>');
    });

    it('should remove style tags', () => {
      const input = '<style>body { display: none; }</style>';
      expect(sanitizeHtml(input)).toBe('');
    });

    it('should remove form tags', () => {
      const input = '<form action="/login"><input type="text"></form>';
      expect(sanitizeHtml(input)).toBe('');
    });
  });

  describe('encodeUri', () => {
    it('should encode URI components', () => {
      const input = 'hello world?&';
      expect(encodeUri(input)).toBe('hello%20world%3F%26');
    });

    it('should handle non-string input', () => {
      // @ts-ignore
      expect(encodeUri(null)).toBe('');
    });
  });

  describe('encodeHref', () => {
    it('should allow valid http URLs (escaped)', () => {
      const input = 'http://example.com';
      expect(encodeHref(input)).toBe('http:&#x2F;&#x2F;example.com');
    });

    it('should block javascript: URLs', () => {
      const input = 'javascript:alert(1)';
      expect(encodeHref(input)).toBe('');
    });

    it('should block javascript: URLs with whitespace', () => {
      const input = '  javascript:alert(1)';
      expect(encodeHref(input)).toBe('');
    });

    it('should handle non-string input', () => {
      // @ts-ignore
      expect(encodeHref(null)).toBe('');
    });
  });
});
