import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

vi.mock('@config/env', () => ({
  Env: {
    APP_NAME: 'TestApp',
  },
}));

describe('Template loader coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('handles absolute paths correctly', async () => {
    mockReadFile.mockResolvedValue('<html>{{name}}</html>');

    const { loadTemplate } = await import('@mail/template-loader');

    const result = await loadTemplate('/absolute/path/template.html', { name: 'Test' });

    expect(mockReadFile).toHaveBeenCalledWith('/absolute/path/template.html', 'utf-8');
    expect(result).toContain('Test');
  });

  it('handles relative paths correctly', async () => {
    mockReadFile.mockResolvedValue('<html>{{name}}</html>');

    const { loadTemplate } = await import('@mail/template-loader');

    const result = await loadTemplate('relative/path/template.html', { name: 'Test' });

    expect(mockReadFile).toHaveBeenCalledWith(
      join(process.cwd(), 'relative/path/template.html'),
      'utf-8'
    );
    expect(result).toContain('Test');
  });

  it('falls back to built-in directory when file not found', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('File not found'))
      .mockResolvedValueOnce('<html>{{name}} - fallback</html>');

    const { loadTemplate } = await import('@mail/template-loader');

    const result = await loadTemplate('missing-template', { name: 'Test' });

    expect(mockReadFile).toHaveBeenCalledTimes(2);
    expect(result).toContain('Test');
    expect(result).toContain('fallback');
  });

  it('includes default variables in template', async () => {
    mockReadFile.mockResolvedValue('<html>{{year}} {{APP_NAME}} {{name}}</html>');

    const { loadTemplate } = await import('@mail/template-loader');

    const result = await loadTemplate('template.html', { name: 'Alice' });

    expect(result).toContain(new Date().getFullYear().toString());
    expect(result).toContain('TestApp');
    expect(result).toContain('Alice');
  });

  it('handles template names with .html extension in fallback', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('File not found'))
      .mockResolvedValueOnce('<html>{{name}}</html>');

    const { loadTemplate } = await import('@mail/template-loader');

    const result = await loadTemplate('template.html', { name: 'Test' });

    expect(mockReadFile).toHaveBeenCalledWith(expect.stringContaining('template.html'), 'utf-8');
    expect(result).toContain('Test');
  });
});
