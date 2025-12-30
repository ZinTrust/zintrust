import { describe, expect, it } from 'vitest';

import { MarkdownRenderer } from '@templates';

describe('MarkdownRenderer branch coverage', () => {
  it('renders plain text with no links (open === -1)', () => {
    const html = MarkdownRenderer.render('hello world');
    expect(html).toContain('<p>hello world</p>');
  });

  it('keeps text when link has no closing bracket (close === -1)', () => {
    const html = MarkdownRenderer.render('[broken');
    expect(html).toContain('<p>[broken</p>');
    expect(html).not.toContain('<a ');
  });

  it("keeps '[text]' when not followed by '(' (not a link)", () => {
    const html = MarkdownRenderer.render('[text] not-a-link');
    expect(html).toContain('<p>[text] not-a-link</p>');
    expect(html).not.toContain('<a ');
  });

  it('keeps text when link has no closing paren (end === -1)', () => {
    const html = MarkdownRenderer.render('[text](https://example.com');
    expect(html).toContain('<p>[text](https:&#x2F;&#x2F;example.com</p>');
    expect(html).not.toContain('<a ');
  });

  it('closes ordered list when an unordered list starts', () => {
    const html = MarkdownRenderer.render('1. first\n- second');

    // Ordered list should close before unordered list opens
    expect(html).toContain('</ol>');
    expect(html).toContain('<ul>');
  });
});
