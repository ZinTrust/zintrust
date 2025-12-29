import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/scaffolding/FileGenerator', () => ({
  FileGenerator: {
    writeFile: vi.fn(),
    createDirectories: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({ Logger: { error: vi.fn() } }));

import { TemplateGenerator } from '@/cli/scaffolding/TemplateGenerator';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { Logger } from '@config/logger';

beforeEach(() => vi.clearAllMocks());

describe('TemplateGenerator extra tests', () => {
  it('validateTemplateName rejects empty and invalid names', () => {
    expect(() => TemplateGenerator.validateTemplateName('')).toThrow();
    expect(() => TemplateGenerator.validateTemplateName('bad name!')).toThrow();
    expect(() => TemplateGenerator.validateTemplateName('good-name1')).not.toThrow();
  });

  it('parseVariablesCsv handles empty and trims/normalizes', () => {
    expect(TemplateGenerator.parseVariablesCsv(undefined)).toEqual([]);
    expect(TemplateGenerator.parseVariablesCsv('a, ,b,a')).toEqual(['a', 'b']);
  });

  it('scaffoldMailMarkdownTemplate returns success or skipped depending on writeFile', () => {
    (FileGenerator.writeFile as any).mockReturnValue(true);
    const res = TemplateGenerator.scaffoldMailMarkdownTemplate({
      name: 'welcome',
      category: 'auth',
      variables: ['name', 'link'],
      copyright: 'x',
      projectRoot: '/tmp',
      overwrite: false,
    });
    expect(res.success).toBe(true);

    (FileGenerator.writeFile as any).mockReturnValue(false);
    const res2 = TemplateGenerator.scaffoldMailMarkdownTemplate({
      name: 'welcome',
      category: 'auth',
      variables: [],
      copyright: 'x',
      projectRoot: '/tmp',
      overwrite: false,
    });
    expect(res2.success).toBe(false);
  });

  it('scaffoldNotificationMarkdownTemplate works and supports smsVariant', () => {
    (FileGenerator.writeFile as any).mockReturnValue(true);
    const res = TemplateGenerator.scaffoldNotificationMarkdownTemplate({
      name: 'alert',
      channels: ['mail', 'sms'],
      variables: ['ip', 'link'],
      smsVariant: 'short',
      copyright: 'x',
      projectRoot: '/tmp',
      overwrite: false,
    });
    expect(res.success).toBe(true);
  });

  it('scaffoldNotificationMarkdownTemplate handles empty channels/variables and default smsVariant', () => {
    (FileGenerator.writeFile as any).mockReturnValue(true);
    const res = TemplateGenerator.scaffoldNotificationMarkdownTemplate({
      name: 'alert-empty',
      channels: [],
      variables: [],
      copyright: 'x',
      projectRoot: '/tmp',
      overwrite: false,
    });
    expect(res.success).toBe(true);
    expect(res.filePath).toContain('src/notification/markdown/alert-empty.md');
  });

  it('scaffoldNotificationMarkdownTemplate returns skipped when writeFile returns false', () => {
    (FileGenerator.writeFile as any).mockReturnValue(false);

    const res = TemplateGenerator.scaffoldNotificationMarkdownTemplate({
      name: 'alert-skipped',
      channels: ['mail'],
      variables: [],
      copyright: 'x',
      projectRoot: '/tmp',
      overwrite: false,
    });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Template already exists (skipped)');
    expect(res.filePath).toContain('src/notification/markdown/alert-skipped.md');
  });

  it('ensureDirectories logs and rethrows when createDirectories fails', () => {
    (FileGenerator.createDirectories as any).mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => TemplateGenerator.ensureDirectories('/tmp')).toThrow();
    expect(Logger.error).toHaveBeenCalled();
  });
});
