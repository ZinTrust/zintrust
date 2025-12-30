import { describe, expect, it, vi } from 'vitest';

describe('MarkdownRenderer more coverage', () => {
  it('throws when markdown is not a string', async () => {
    const { MarkdownRenderer } = await import('@templates');
    // @ts-expect-error intentional
    expect(() => MarkdownRenderer.render(123)).toThrow();
  });

  it('renderWithLayout returns notification wrapper', async () => {
    const { MarkdownRenderer } = await import('@templates');
    const html = MarkdownRenderer.renderWithLayout('hi', 'notification');
    expect(html).toContain('<div class="notification">');
  });

  it('does not treat ####### as a heading and requires whitespace after hashes', async () => {
    const { MarkdownRenderer } = await import('@templates');

    const html1 = MarkdownRenderer.render('####### nope');
    expect(html1).toContain('<p>####### nope</p>');

    const html2 = MarkdownRenderer.render('###NoSpace');
    expect(html2).toContain('<p>###NoSpace</p>');

    const html3 = MarkdownRenderer.render('##\tTabbed');
    expect(html3).toContain('<h2>Tabbed</h2>');
  });

  it('parses list items only when bullet/dot format is valid', async () => {
    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('-nope\n1.nope\n- ok');
    expect(html).toContain('<p>-nope</p>');
    expect(html).toContain('<p>1.nope</p>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>ok</li>');
  });

  it('handles empty link url and leaves bad patterns untouched', async () => {
    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('[x]()');
    expect(html).toContain('<a href="#"');

    const notLink = MarkdownRenderer.render('[x] (not-a-link)');
    expect(notLink).toContain('<p>[x] (not-a-link)</p>');
  });

  it('closes an unterminated code fence at EOF', async () => {
    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('```\nhello');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('hello');
  });

  it('treats an overlong code-fence language identifier as plain text', async () => {
    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('```this-language-id-is-way-too-long-for-the-parser');
    expect(html).toContain('<p>```this-language-id-is-way-too-long-for-the-parser</p>');
  });

  it('sanitizeHref falls back to # when encodeHref returns empty', async () => {
    vi.resetModules();

    vi.doMock('@security/XssProtection', () => ({
      XssProtection: {
        escape: (s: string) => s,
        isSafeUrl: (_s: string) => true,
        encodeHref: (_s: string) => '',
      },
    }));

    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('[t](https://example.com)');
    expect(html).toContain('<a href="#"');
  });

  it('sanitizeHref returns encoded href when url is safe and encodeHref is non-empty', async () => {
    vi.resetModules();

    vi.doMock('@security/XssProtection', () => ({
      XssProtection: {
        escape: (s: string) => s,
        isSafeUrl: (_s: string) => true,
        encodeHref: (_s: string) => 'https://example.com/ok',
      },
    }));

    const { MarkdownRenderer } = await import('@templates');
    const html = MarkdownRenderer.render('[t](https://example.com)');
    expect(html).toContain('<a href="https://example.com/ok"');
  });

  it('closes ordered lists on blank lines', async () => {
    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('1. one\n\nplain');
    expect(html).toContain('<ol>');
    expect(html).toContain('</ol>');
    expect(html).toContain('<p>plain</p>');
  });

  it('closes code fences without language when closing fence is present', async () => {
    vi.resetModules();
    vi.doUnmock('@security/XssProtection');

    const { MarkdownRenderer } = await import('@templates');

    const html = MarkdownRenderer.render('```\n<hi>\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('&lt;hi&gt;');
    expect(html).toContain('</code></pre>');
    expect(html).not.toContain('language-');
  });
});
