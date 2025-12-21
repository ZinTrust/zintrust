import { XssProtection } from '@security/XssProtection';
import { describe, expect, it } from 'vitest';

describe('XssProtection Escape Basic', () => {
  it('should escape HTML special characters', () => {
    const input = '<script>alert("XSS")</script>';
    const output = XssProtection.escape(input);

    expect(output).toContain('&lt;');
    expect(output).toContain('&gt;');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
  });

  it('should escape ampersand', () => {
    expect(XssProtection.escape('A & B')).toBe('A &amp; B');
  });

  it('should escape quotes', () => {
    expect(XssProtection.escape('He said "hello"')).toContain('&quot;');
  });

  it('should escape single quotes', () => {
    expect(XssProtection.escape("It's fine")).toContain('&#39;');
  });

  it('should escape forward slash', () => {
    expect(XssProtection.escape('</script>')).toContain('&#x2F;');
  });
});

describe('XssProtection Escape Advanced', () => {
  it('should handle multiple special characters', () => {
    const input = '<img src="x" onerror="alert(\'XSS\')">';
    const output = XssProtection.escape(input);

    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
    expect(output).not.toContain('"');
    expect(output).not.toContain("'");
  });

  it('should return empty string for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(XssProtection.escape(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(XssProtection.escape(undefined as any)).toBe('');
  });
});

describe('XssProtection Sanitize Basic', () => {
  it('should remove script tags', () => {
    const input = '<p>Hello</p><script>alert("XSS")</script>';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('<script');
    expect(output).not.toContain('alert');
    expect(output).toContain('<p>Hello</p>');
  });

  it('should remove iframe tags', () => {
    const input = '<iframe src="evil.com"></iframe>';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('<iframe');
  });

  it('should remove event handlers', () => {
    const input = '<img src="x" onclick="alert(\'XSS\')" />';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('onclick');
  });

  it('should remove on* attributes', () => {
    const input = '<div onmouseover="alert(\'XSS\')">test</div>';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('onmouseover');
  });
});

describe('XssProtection Sanitize Advanced', () => {
  it('should remove form tags', () => {
    const input = '<form action="evil.com"><input type="text" /></form>';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('<form');
    expect(output).not.toContain('</form>');
  });

  it('should remove object tags', () => {
    const input = '<object data="evil.swf"></object>';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('<object');
  });

  it('should remove style tags', () => {
    const input = '<p>Hello</p><style>body { display:none; }</style>';
    const output = XssProtection.sanitize(input);

    expect(output).not.toContain('<style');
  });

  it('should preserve safe HTML', () => {
    const input = '<p>Hello <b>World</b></p>';
    const output = XssProtection.sanitize(input);

    expect(output).toContain('<p>Hello <b>World</b></p>');
  });
});

describe('XssProtection URI and URL Validation', () => {
  describe('encodeUri', () => {
    it('should encode URI component', () => {
      const result = XssProtection.encodeUri('hello world');
      expect(result).toBe('hello%20world');
    });

    it('should encode special characters', () => {
      const result = XssProtection.encodeUri('a&b=c');
      expect(result).toContain('%');
    });

    it('should return empty string for non-string', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(XssProtection.encodeUri(null as any)).toBe('');
    });
  });

  describe('encodeHref', () => {
    it('should allow http URLs', () => {
      const result = XssProtection.encodeHref('http://example.com');
      expect(result).toContain('http:');
      expect(result).toContain('example.com');
    });

    it('should allow https URLs', () => {
      const result = XssProtection.encodeHref('https://example.com');
      expect(result).toContain('https:');
      expect(result).toContain('example.com');
    });

    it('should block javascript: protocol', () => {
      const result = XssProtection.encodeHref('javascript:alert("XSS")'); // NOSONAR
      expect(result).toBe('');
    });

    it('should block data: HTML protocol', () => {
      const result = XssProtection.encodeHref('data:text/html,<script>alert(1)</script>');
      expect(result).toBe('');
    });

    it('should escape HTML entities in safe URLs', () => {
      const result = XssProtection.encodeHref('http://example.com?a=1&b=2');
      expect(result).toContain('&amp;');
    });
  });
});

describe('XssProtection JSON and Safety', () => {
  describe('isSafeUrl', () => {
    it('should allow relative URLs', () => {
      expect(XssProtection.isSafeUrl('/page')).toBe(true);
      expect(XssProtection.isSafeUrl('#section')).toBe(true);
    });

    it('should allow http/https URLs', () => {
      expect(XssProtection.isSafeUrl('http://example.com')).toBe(true);
      expect(XssProtection.isSafeUrl('https://example.com')).toBe(true);
    });

    it('should block javascript: protocol', () => {
      expect(XssProtection.isSafeUrl('javascript:alert(1)')).toBe(false); // NOSONAR
    });

    it('should block data: protocol', () => {
      expect(XssProtection.isSafeUrl('data:text/html,<script>')).toBe(false);
    });

    it('should block other protocols', () => {
      expect(XssProtection.isSafeUrl('vbscript:msgbox(1)')).toBe(false);
      expect(XssProtection.isSafeUrl('file:///etc/passwd')).toBe(false);
    });

    it('should return false for non-string', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(XssProtection.isSafeUrl(null as any)).toBe(false);
    });
  });

  describe('escapeJson', () => {
    it('should escape JSON for HTML embedding', () => {
      const obj = { key: '<script>' };
      const result = XssProtection.escapeJson(obj);

      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should handle complex objects', () => {
      const obj = { user: '<img src=x>' };
      const result = XssProtection.escapeJson(obj);

      expect(result).not.toContain('<img');
    });
  });
});
