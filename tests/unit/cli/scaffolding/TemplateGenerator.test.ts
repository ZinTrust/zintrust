import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/path');
vi.mock('@/cli/scaffolding/FileGenerator');
vi.mock('@/config/logger');

import { FileGenerator } from '@/cli/scaffolding/FileGenerator';
import { TemplateGenerator } from '@/cli/scaffolding/TemplateGenerator';
import * as path from '@node-singletons/path';

describe('TemplateGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(path.join).mockImplementation((...args: string[]) => args.join('/'));
    vi.mocked(FileGenerator.writeFile).mockReturnValue(true as any);
    vi.mocked(FileGenerator.createDirectories).mockReturnValue(undefined as any);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('scaffolds mail markdown template with expected path and header', async () => {
    const result = await TemplateGenerator.scaffoldMailMarkdownTemplate({
      name: 'welcome',
      category: 'auth',
      variables: ['name', 'confirmLink', 'expiryMinutes'],
      copyright: '© 2025 Example',
      projectRoot: '/project',
      overwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.filePath).toContain('/project/src/mail/markdown/auth/welcome.md');

    const writeArgs = vi.mocked(FileGenerator.writeFile).mock.calls[0];
    expect(writeArgs[0]).toBe('/project/src/mail/markdown/auth/welcome.md');
    expect(writeArgs[1]).toContain('<!-- Mail Template: welcome -->');
    expect(writeArgs[1]).toContain('<!-- Category: auth -->');
    expect(writeArgs[1]).toContain('<!-- Variables: name, confirmLink, expiryMinutes -->');
    expect(writeArgs[1]).toContain('- **confirmLink:** {{confirmLink}}');
    expect(writeArgs[1]).toContain('- **expiryMinutes:** {{expiryMinutes}}');
  });

  it('scaffolds notification markdown template with sms variant', async () => {
    const result = await TemplateGenerator.scaffoldNotificationMarkdownTemplate({
      name: 'security-alert',
      channels: ['mail', 'sms'],
      variables: ['ipAddress', 'location', 'deviceName', 'reviewLink'],
      smsVariant: 'short',
      copyright: '© 2025 Example',
      projectRoot: '/project',
      overwrite: true,
    });

    expect(result.success).toBe(true);
    expect(result.filePath).toContain('/project/src/notification/markdown/security-alert.md');

    const writeArgs = vi.mocked(FileGenerator.writeFile).mock.calls[0];
    expect(writeArgs[0]).toBe('/project/src/notification/markdown/security-alert.md');
    expect(writeArgs[1]).toContain('<!-- Notification Template: security-alert -->');
    expect(writeArgs[1]).toContain('<!-- Channels: mail, sms -->');
    expect(writeArgs[1]).toContain('<!-- SMS Variant: short -->');
    expect(writeArgs[1]).toContain('<!-- SMS Variant Start -->');
    expect(writeArgs[1]).toContain('- **ipAddress:** {{ipAddress}}');
  });

  it('returns skipped result when writeFile returns false', async () => {
    vi.mocked(FileGenerator.writeFile).mockReturnValue(false as any);

    const result = await TemplateGenerator.scaffoldMailMarkdownTemplate({
      name: 'welcome',
      category: 'auth',
      variables: [],
      copyright: '© 2025 Example',
      projectRoot: '/project',
      overwrite: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('skipped');
  });
});
