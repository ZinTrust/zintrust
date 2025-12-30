import { loadTemplate } from '@mail/templates/markdown';
import { MarkdownRenderer } from '@templates';
import { describe, expect, it } from 'vitest';

describe('Mail Markdown Templates', () => {
  it('loads auth/welcome.md and returns metadata and content', () => {
    const tpl = loadTemplate('auth/welcome');
    expect(tpl.subject).toBe('Welcome to Zintrust');
    expect(tpl.preheader).toBe('Thanks for joining our platform');
    expect(tpl.variables).toContain('name');
    const html = MarkdownRenderer.render(tpl.content, {
      name: 'Alice',
      confirmLink: 'https://example.com',
      expiryMinutes: 60,
    });
    expect(html).toContain('<h1>Welcome, Alice!</h1>');
    expect(html).toContain('Verify Email');
  });
});
