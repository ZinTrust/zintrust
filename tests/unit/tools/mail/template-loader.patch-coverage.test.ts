import { describe, expect, it, vi } from 'vitest';

import { getAvailableTemplates, loadTemplate } from '@mail/template-loader';
import { readFile } from '@node-singletons/fs';

vi.mock('@node-singletons/fs', () => ({
  readFile: vi.fn(),
}));

describe('mail template-loader patch coverage', () => {
  it('lists available templates', () => {
    expect(getAvailableTemplates()).toEqual([
      'welcome.html',
      'password-reset.html',
      'job-completed.html',
      'worker-alert.html',
      'performance-report.html',
    ]);
  });

  it('renders variables, conditionals, and loops', async () => {
    const template = [
      'Hello {{name}}!',
      '{{#if_active}}Active{{/if_active}}',
      '{{#each_items}}<span>{{label}}</span>{{/each_items}}',
    ].join('\n');

    vi.mocked(readFile).mockResolvedValueOnce(template);

    const html = await loadTemplate('sample.html', {
      name: 'Ada',
      active: true,
      items: [{ label: 'One' }, { label: 'Two' }],
    });

    expect(html).toContain('Hello Ada!');
    expect(html).toContain('Active');
    expect(html).toContain('<span>One</span>');
    expect(html).toContain('<span>Two</span>');
  });

  it('removes conditionals and loops when variables are missing', async () => {
    const template = [
      'Hello {{name}}!',
      '{{#if_active}}Active{{/if_active}}',
      '{{#each_items}}<span>{{label}}</span>{{/each_items}}',
    ].join('\n');

    vi.mocked(readFile).mockResolvedValueOnce(template);

    const html = await loadTemplate('sample.html', {
      name: 'Ada',
      active: false,
      items: undefined,
    });

    expect(html).toContain('Hello Ada!');
    expect(html).not.toContain('Active');
    expect(html).not.toContain('<span>');
  });

  it('throws when template load fails', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('boom'));

    await expect(loadTemplate('missing.html')).rejects.toThrow(
      'Failed to load template missing.html'
    );
  });
});
