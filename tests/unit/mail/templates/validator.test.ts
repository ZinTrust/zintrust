import { loadTemplate, renderTemplate } from '@mail/templates';
import { describe, expect, it } from 'vitest';

describe('Mail Template HTML Rendering', () => {
  it('loads a template and includes required placeholders', () => {
    const tpl = loadTemplate('auth-password-reset');
    expect(tpl.content).toContain('{{reset_url}}');
    expect(tpl.content).toContain('{{expiryMinutes}}');
  });

  it('renders variables into HTML', () => {
    const rendered = renderTemplate('auth-password-reset', {
      name: 'Dana',
      email: 'dana@example.com',
      reset_url: 'https://example.com/reset',
      expiryMinutes: 30,
      APP_NAME: 'ZinTrust Framework',
      year: 2026,
    });

    expect(rendered.html).toContain('Dana');
    expect(rendered.html).toContain('https://example.com/reset');
  });
});
