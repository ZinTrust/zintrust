import { MakeNotificationTemplateCommand } from '@/cli/commands/MakeNotificationTemplateCommand';
import { TemplateGenerator } from '@cli/scaffolding/TemplateGenerator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/scaffolding/TemplateGenerator');
vi.mock('@cli/PromptHelper');
vi.mock('@cli/scaffolding/FileGenerator');
vi.mock('@cli/ErrorHandler');

describe('MakeNotificationTemplateCommand (extra)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should not prompt for channels when running non-interactive and no channels provided', async () => {
    const cmd = MakeNotificationTemplateCommand.create();

    (TemplateGenerator.ensureDirectories as unknown as jest.Mock) = vi.fn();
    (TemplateGenerator.scaffoldNotificationMarkdownTemplate as unknown as jest.Mock) = vi
      .fn()
      .mockReturnValue({ success: true, message: 'ok' });

    await cmd.execute({ args: ['security-alert'], noInteractive: true } as any);

    expect(
      TemplateGenerator.scaffoldNotificationMarkdownTemplate as unknown as jest.Mock
    ).toHaveBeenCalled();
    const callArg = (TemplateGenerator.scaffoldNotificationMarkdownTemplate as unknown as jest.Mock)
      .mock.calls[0][0];
    expect(callArg.channels).toEqual([]);
  });
});
