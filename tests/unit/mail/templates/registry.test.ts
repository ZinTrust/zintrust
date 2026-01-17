import { listTemplates, renderTemplate } from '@mail/templates/markdown';
import { describe, expect, it } from 'vitest';

describe('Mail Markdown Registry', () => {
  it('lists available templates', () => {
    const templates = listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates).toContain('auth/welcome');
  });

  it('renders a template to html with variables applied', () => {
    const { html, meta } = renderTemplate('auth/welcome', {
      name: 'Bob',
      confirmLink: 'https://example.com/confirm',
      expiryMinutes: 30,
    });

    expect(meta.subject).toBe('Welcome to ZinTrust');
    expect(html).toContain('<h1>Welcome, Bob!</h1>');
    expect(html).toContain('Verify Email');
  });

  it('renders transactional and notification templates', () => {
    const pw = renderTemplate('transactional/password-reset', {
      name: 'Dana',
      resetLink: 'https://example.com/reset',
      expiryMinutes: 30,
    });
    expect(pw.meta.subject).toBe('Reset your password');
    expect(pw.html).toContain('Reset password');

    const nc = renderTemplate('notifications/new-comment', {
      name: 'Dana',
      commenter: 'Alex',
      commentExcerpt: 'Nice post!',
      postLink: 'https://example.com/post/1',
    });
    expect(nc.meta.subject).toBe('New comment on your post');
    expect(nc.html).toContain('View comment');
  });
});
