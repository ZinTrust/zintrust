import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: { success: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), handle: vi.fn() },
}));

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: { textInput: vi.fn(), chooseFrom: vi.fn(), confirm: vi.fn() },
}));

vi.mock('@cli/scaffolding/TemplateGenerator', () => ({
  TemplateGenerator: {
    parseVariablesCsv: vi.fn(() => []),
    ensureDirectories: vi.fn(),
    scaffoldMailMarkdownTemplate: vi.fn(),
  },
}));

vi.mock('@cli/scaffolding/FileGenerator', () => ({ FileGenerator: { fileExists: vi.fn() } }));
vi.mock('@node-singletons/path', () => ({ join: (...p: string[]) => p.join('/') }));

import { MakeMailTemplateCommand } from '@cli/commands/MakeMailTemplateCommand';
import { ErrorHandler } from '@cli/ErrorHandler';
import { PromptHelper } from '@cli/PromptHelper';
import { FileGenerator } from '@cli/scaffolding/FileGenerator';
import { TemplateGenerator } from '@cli/scaffolding/TemplateGenerator';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MakeMailTemplateCommand', () => {
  it('throws when name missing in non-interactive mode', async () => {
    const cmd = MakeMailTemplateCommand.create();
    await expect(cmd.execute({ args: [], noInteractive: true })).rejects.toBeDefined();
  });

  it('scaffolds and calls success when template created', async () => {
    // interactive flow
    // @ts-ignore
    vi.mocked(PromptHelper.textInput).mockResolvedValueOnce('welcome');
    // @ts-ignore
    vi.mocked(PromptHelper.chooseFrom).mockResolvedValueOnce('auth');
    // @ts-ignore
    vi.mocked(PromptHelper.textInput).mockResolvedValueOnce('');

    // File exists -> prompt confirm returns true to overwrite
    // @ts-ignore
    vi.mocked(FileGenerator.fileExists).mockReturnValue(true);
    // @ts-ignore
    vi.mocked(PromptHelper.confirm).mockResolvedValueOnce(true);

    // scaffold returns success
    // @ts-ignore
    vi.mocked(TemplateGenerator.scaffoldMailMarkdownTemplate).mockReturnValue({
      success: true,
      message: 'ok',
    });

    const cmd = MakeMailTemplateCommand.create();
    await cmd.execute({ args: [] });

    expect(vi.mocked(TemplateGenerator.scaffoldMailMarkdownTemplate)).toHaveBeenCalled();
    expect(vi.mocked(ErrorHandler.success)).toHaveBeenCalled();
  });

  it('calls warn when scaffold fails', async () => {
    // provide name via args and non-interactive
    // @ts-ignore
    vi.mocked(TemplateGenerator.scaffoldMailMarkdownTemplate).mockReturnValue({
      success: false,
      message: 'fail',
    });

    const cmd = MakeMailTemplateCommand.create();
    await cmd.execute({ args: ['n'], noInteractive: true, category: 'auth', vars: '' });

    expect(vi.mocked(ErrorHandler.warn)).toHaveBeenCalled();
  });
});
