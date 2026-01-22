import { listTemplates, renderTemplate } from '@mail/templates';
import { describe, expect, it } from 'vitest';

describe('Mail Template Registry', () => {
  it('lists available templates', () => {
    const templates = listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates).toContain('auth-welcome');
  });

  it('renders a template to html with variables applied', () => {
    const { html, meta } = renderTemplate('auth-welcome', {
      name: 'Bob',
      confirmLink: 'https://example.com/confirm',
      expiryMinutes: 30,
      APP_NAME: 'ZinTrust Framework',
    });

    expect(meta.subject).toBeUndefined();
    expect(html).toContain('Welcome, Bob!');
    expect(html).toContain('Verify Email Address');
  });

  it('renders transactional and notification templates', () => {
    const pw = renderTemplate('password-reset', {
      name: 'Dana',
      reset_url: 'https://example.com/reset',
      expiryTime: '1 hour',
      APP_NAME: 'ZinTrust Framework',
    });
    expect(pw.meta.subject).toBeUndefined();
    expect(pw.html).toContain('Reset Password');

    const nc = renderTemplate('notifications-new-comment', {
      name: 'Dana',
      commenterName: 'Alex',
      commenterInitial: 'A',
      commentTime: 'Just now',
      commentText: 'Nice post!',
      commentLink: 'https://example.com/post/1',
      postTitle: 'Hello World',
      unsubscribeLink: 'https://example.com/settings',
    });
    expect(nc.meta.subject).toBeUndefined();
    expect(nc.html).toContain('View Comment');
  });
});
