import { Xss } from '@security/Xss';
import { describe, expect, it } from 'vitest';

describe('Xss', () => {
  it('sanitizes strings by stripping tags then escaping entities', () => {
    const input = `<b>Hi</b> & <script>alert('x')</script>`;
    // After stripTags: "Hi & alert('x')"
    expect(Xss.sanitize(input)).toBe('Hi &amp; alert(&#39;x&#39;)');
  });

  it('sanitizes nested objects and arrays recursively', () => {
    const input = {
      name: '<b>Alice</b>',
      meta: {
        about: 'Hello <img src=x onerror=alert(1)> world',
      },
      tags: ['<i>x</i>', 1, true, null],
    };

    const out = Xss.sanitize(input) as any;

    expect(out.name).toBe('Alice');
    expect(out.meta.about).toContain('Hello');
    expect(out.meta.about).not.toContain('<img');
    expect(out.tags[0]).toBe('x');
    expect(out.tags[1]).toBe(1);
    expect(out.tags[2]).toBe(true);
    expect(out.tags[3]).toBe(null);
  });
});
