import { loadTemplate, renderTemplate } from '@mail/templates';
import { describe, expect, it } from 'vitest';

describe('Mail HTML Templates', () => {
  it('loads auth-welcome.html and renders variables', () => {
    const tpl = loadTemplate('auth-welcome');
    expect(tpl.content).toContain('Welcome, {{name}}!');
    const rendered = renderTemplate('auth-welcome', {
      name: 'Alice',
      confirmLink: 'https://example.com',
      expiryMinutes: 60,
      APP_NAME: 'ZinTrust Framework',
    });
    expect(rendered.html).toContain('Welcome, Alice!');
    expect(rendered.html).toContain('Verify Email Address');
  });
});
