import { listTemplates, renderTemplate } from '@notification/templates/markdown';
import { describe, expect, it } from 'vitest';

describe('Notification Markdown Registry', () => {
  it('lists available notification templates', () => {
    const templates = listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates).toContain('notifications/new-follow');
  });

  it('renders a notification template', () => {
    const { html, meta } = renderTemplate('notifications/new-follow', {
      name: 'Sam',
      follower: 'Jordan',
    });
    expect(meta.subject).toBe('New follower');
    expect(html).toContain('started following you');
  });
});
