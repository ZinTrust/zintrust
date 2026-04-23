import { EnvKeyGenerateCommand } from '@cli/commands/EnvKeyGenerateCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { fsPromises as fs } from '@node-singletons/fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: {
    confirm: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@exceptions/ZintrustError', () => ({
  ErrorFactory: {
    createCliError: vi.fn((message: string) => new Error(message)),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  fsPromises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('@node-singletons/crypto', () => ({
  randomBytes: vi.fn().mockReturnValue({
    toString: vi.fn().mockReturnValue('generated-env-key'),
  }),
}));

describe('EnvKeyGenerateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the generated key without writing files', async () => {
    const command = EnvKeyGenerateCommand.create();

    await command.execute({ args: ['D1_REMOTE_SECRET'], show: true });

    expect(Logger.info).toHaveBeenCalledWith('D1_REMOTE_SECRET=base64:generated-env-key');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('writes a missing env key', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('APP_KEY=base64:existing-app-key\n');
    const command = EnvKeyGenerateCommand.create();

    await command.execute({ args: ['D1_REMOTE_SECRET'] });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('D1_REMOTE_SECRET=base64:generated-env-key')
    );
  });

  it('asks before overwriting an existing env key', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('D1_REMOTE_SECRET=base64:old-secret\n');
    vi.mocked(PromptHelper.confirm).mockResolvedValue(false);
    const command = EnvKeyGenerateCommand.create();

    await command.execute({ args: ['D1_REMOTE_SECRET'] });

    expect(PromptHelper.confirm).toHaveBeenCalledWith(
      'D1_REMOTE_SECRET already exists. Override it?',
      false,
      true
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith('Skipped updating D1_REMOTE_SECRET.');
  });

  it('overwrites immediately when --yes is provided', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('D1_REMOTE_SECRET=base64:old-secret\n');
    const command = EnvKeyGenerateCommand.create();

    await command.execute({ args: ['D1_REMOTE_SECRET'], yes: true });

    expect(PromptHelper.confirm).not.toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      'D1_REMOTE_SECRET=base64:generated-env-key\n'
    );
  });

  it('rejects invalid env keys', async () => {
    const command = EnvKeyGenerateCommand.create();

    await expect(command.execute({ args: ['bad-key'] })).rejects.toThrow(
      'A valid env key is required. Use uppercase letters, numbers, and underscores only.'
    );
    expect(ErrorFactory.createCliError).toHaveBeenCalled();
  });
});
