import { XssProtection } from '@/security/XssProtection';

describe('XssProtection - extra branches', () => {
  test('sanitize removes script tags and attributes', () => {
    const src =
      '<div onclick="alert(1)">Hello<script>alert(2)</script><img src=x onerror=alert(3)></div>';
    const out = XssProtection.sanitize(src);
    expect(out).toContain('Hello');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('onclick=');
    expect(out).not.toContain('onerror=');
  });

  test('allowed tags and attributes preserved when safe', () => {
    const src = '<p class="lead">Safe <strong>bold</strong></p>';
    const out = XssProtection.sanitize(src);
    expect(out).toContain('Safe');
    expect(out).toContain('<strong>');
    expect(out).toContain('class="lead"');
  });

  test('strip disallowed protocols in href/src', () => {
    const src =
      '<a href="javascript:alert(1)">click</a><img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">';
    const out = XssProtection.sanitize(src);
    expect(out).toContain('click');
    expect(out).not.toContain('javascript:');
    // data urls should be removed from src
    expect(out).not.toContain('data:text/html');
  });

  test('sanitize handles non-string input gracefully', () => {
    // @ts-expect-error testing runtime behavior
    expect(XssProtection.sanitize(null)).toBe('');
    // @ts-expect-error
    expect(XssProtection.sanitize(undefined)).toBe('');
  });
});
