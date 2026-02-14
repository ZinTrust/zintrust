import * as fs from 'node:fs';
import * as path from 'node:path';
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

  it('uses builtin template loader for known templates', async () => {
    const html = await loadTemplate('welcome', { appName: 'ZinTrust' });
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('handles builtin loader import failure and falls back to file candidates', async () => {
    vi.doMock('@mail/templates/welcome.js', () => {
      throw new Error('builtin-import-failed');
    });

    vi.mocked(readFile).mockResolvedValueOnce('<html>Fallback {{name}}</html>');

    try {
      const html = await loadTemplate('welcome', { name: 'Ada' });
      expect(html).toContain('Fallback Ada');
    } finally {
      vi.doUnmock('@mail/templates/welcome.js');
    }
  });

  it('falls back to module candidate import when readFile candidates fail', async () => {
    const moduleName = 'module-fallback-template';
    const cwd = process.cwd();
    const moduleDir = path.join(cwd, 'dist', 'src', 'tools', 'mail', 'templates');
    const modulePath = path.join(moduleDir, `${moduleName}.js`);

    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(modulePath, "export default '<html>Module {{name}}</html>'\n", 'utf8');

    vi.mocked(readFile).mockRejectedValue(new Error('missing-file'));

    try {
      const html = await loadTemplate(moduleName, { name: 'Ada' });
      expect(html).toContain('Module Ada');
    } finally {
      fs.rmSync(modulePath, { force: true });
    }
  });

  it('preserves content when each block is unclosed', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('<html>{{#each_rows}}<li>{{name}}</li></html>');

    const html = await loadTemplate('sample.html', { rows: [{ name: 'Ada' }] });
    expect(html).toContain('{{#each_rows}}<li>{{name}}</li>');
  });

  it('preserves unclosed each block when template html is passed directly', async () => {
    const html = await loadTemplate('<html>{{#each_rows}}<li>{{name}}</li></html>', {
      rows: [{ name: 'Ada' }],
    });

    expect(html).toContain('{{#each_rows}}<li>{{name}}</li>');
  });

  it('preserves malformed open token blocks safely', async () => {
    const html = await loadTemplate('<html>{{#each_rows<li>{{name}}</li></html>', {
      rows: [{ name: 'Ada' }],
    });

    expect(html).toContain('{{#each_rows<li>{{name}}</li>');
  });

  it('renders repeated conditional tokens safely', async () => {
    const repeated = '{{#if_a}}a'.repeat(3000) + '{{/if_a}}';
    vi.mocked(readFile).mockResolvedValueOnce(`<html>${repeated}</html>`);

    const html = await loadTemplate('sample.html', { a: true });
    expect(html.startsWith('<html>')).toBe(true);
    expect(html.endsWith('</html>')).toBe(true);
  });
});
