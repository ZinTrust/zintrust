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
      'general.html',
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

  it('handles malformed and unclosed block tags without catastrophic backtracking', async () => {
    const template = [
      '<html>',
      '{{#if_bad-name}}NO{{/if_bad-name}}',
      '{{#if_open}}still-open',
      '{{#each_rows}}<li>{{name}}</li>{{/each_rows}}',
      '</html>',
    ].join('\n');

    vi.mocked(readFile).mockResolvedValueOnce(template);

    const html = await loadTemplate('sample.html', {
      open: true,
      rows: [{ name: 'Ada' }],
    });

    expect(html).toContain('{{#if_bad-name}}NO{{/if_bad-name}}');
    expect(html).toContain('{{#if_open}}still-open');
    expect(html).toContain('<li>Ada</li>');
  });

  it('renders repeated conditional tokens safely', async () => {
    const repeated = '{{#if_a}}a'.repeat(3000) + '{{/if_a}}';
    vi.mocked(readFile).mockResolvedValueOnce(`<html>${repeated}</html>`);

    const html = await loadTemplate('sample.html', { a: true });
    expect(html.startsWith('<html>')).toBe(true);
    expect(html.endsWith('</html>')).toBe(true);
  });
});
