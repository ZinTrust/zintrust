import { MarkdownRenderer } from '@templates';
import { describe, expect, it } from 'vitest';

describe('MarkdownRenderer', () => {
  it('renders headings, bold and italic', () => {
    const md = `# Title\n\n## Subtitle\n\nThis is **bold** and this is *italic*.`;
    const html = MarkdownRenderer.render(md);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Subtitle</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders links safely (reject javascript:)', () => {
    const md = `[click me](javascript:alert(1))`;
    const html = MarkdownRenderer.render(md);
    expect(html).toContain('<a href="#"');
  });

  it('renders code blocks and inline code', () => {
    const md = "Here is `inline` code.\n\n```js\nconsole.log('hi')\n```";
    const html = MarkdownRenderer.render(md);
    expect(html).toContain('<code>inline</code>');
    expect(html).toContain('<pre><code class="language-js">');
    expect(html).toContain('console.log(&#39;hi&#39;)');
  });

  it('interpolates variables and escapes HTML', () => {
    const md = 'Hello {{name}}!';
    const html = MarkdownRenderer.render(md, { name: '<script>alert(1)</script>' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  });

  it('renders lists', () => {
    const md = '- one\n- two\n1. three\n2. four';
    const html = MarkdownRenderer.render(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>three</li>');
  });

  it('provides email layout wrapper', () => {
    const md = '# Hi\n\nParagraph';
    const html = MarkdownRenderer.renderWithLayout(md, 'email');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<div class="email">');
  });
});
