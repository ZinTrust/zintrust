import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: {
    textInput: vi.fn(),
    confirm: vi.fn(),
  },
}));

vi.mock('inquirer', () => ({ prompt: vi.fn(), default: { prompt: vi.fn() } }));
vi.mock('@cli/scaffolding/TemplateGenerator', () => ({
  TemplateGenerator: {
    ensureDirectories: vi.fn(),
    scaffoldNotificationMarkdownTemplate: vi.fn(),
    parseVariablesCsv: (s: string) => (s ? s.split(',').map((p) => p.trim()) : []),
  },
}));
vi.mock('@cli/scaffolding/FileGenerator', () => ({ FileGenerator: { fileExists: vi.fn() } }));
vi.mock('@cli/ErrorHandler', () => ({ ErrorHandler: { success: vi.fn(), warn: vi.fn() } }));

import { MakeNotificationTemplateCommand } from '@/cli/commands/MakeNotificationTemplateCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { PromptHelper } from '@cli/PromptHelper';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { TemplateGenerator } from '@cli/scaffolding/TemplateGenerator';
import inquirer from 'inquirer';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MakeNotificationTemplateCommand - advanced flows', () => {
  it('non-interactive with flags scaffolds successfully and calls success', async () => {
    // arrange
    (TemplateGenerator.scaffoldNotificationMarkdownTemplate as any).mockReturnValue({
      success: true,
      message: 'ok',
    });

    const command = MakeNotificationTemplateCommand.create();

    const options: any = {
      args: ['security-alert'],
      channels: 'mail,sms,MAIL,invalid',
      vars: 'ip,location',
      smsVariant: 'short',
      overwrite: true,
      noInteractive: true,
    };

    // act
    await command.execute(options);

    // assert
    expect(TemplateGenerator.ensureDirectories).toHaveBeenCalled();
    expect(TemplateGenerator.scaffoldNotificationMarkdownTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'security-alert',
        channels: ['mail', 'sms'],
        variables: ['ip', 'location'],
        smsVariant: 'short',
        overwrite: true,
      })
    );

    expect(ErrorHandler.success).toHaveBeenCalledWith('ok');
  });

  it('interactive prompts for channels when missing and warns on scaffold failure', async () => {
    (inquirer.prompt as any).mockResolvedValue({ channels: ['slack', 'discord'] });

    (TemplateGenerator.scaffoldNotificationMarkdownTemplate as any).mockReturnValue({
      success: false,
      message: 'failed',
    });

    const command = MakeNotificationTemplateCommand.create();

    const options: any = {
      args: ['foo-alert'],
      noInteractive: false,
    };

    await command.execute(options);

    expect(inquirer.prompt).toHaveBeenCalled();
    expect(TemplateGenerator.scaffoldNotificationMarkdownTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['slack', 'discord'],
        name: 'foo-alert',
      })
    );

    expect(ErrorHandler.warn).toHaveBeenCalledWith('failed');
  });

  it('maybeEnableOverwrite prompts when file exists and uses confirmation', async () => {
    // file exists
    (FileGenerator.fileExists as any).mockReturnValue(true);
    (PromptHelper.confirm as any).mockResolvedValue(true);

    (TemplateGenerator.scaffoldNotificationMarkdownTemplate as any).mockReturnValue({
      success: true,
      message: 'ok',
    });

    const command = MakeNotificationTemplateCommand.create();

    const options: any = {
      args: ['overwrite-me'],
      noInteractive: false,
    };

    await command.execute(options);

    expect(PromptHelper.confirm).toHaveBeenCalled();
    expect(TemplateGenerator.scaffoldNotificationMarkdownTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ overwrite: true })
    );
  });

  it('throws validation error when no name provided in non-interactive mode', async () => {
    const command = MakeNotificationTemplateCommand.create();
    const options: any = { args: [], noInteractive: true };

    await expect(command.execute(options)).rejects.toBeDefined();
  });
});
