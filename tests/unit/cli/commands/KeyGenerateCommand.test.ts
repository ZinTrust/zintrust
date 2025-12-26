import { KeyGenerateCommand } from '@cli/commands/KeyGenerateCommand';
import { Logger } from '@config/logger';
import { fsPromises as fs } from '@node-singletons/fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
    toString: vi.fn().mockReturnValue('mocked-base64-key'),
  }),
}));

describe('KeyGenerateCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate and show key when --show is provided', async () => {
    const command = KeyGenerateCommand.create();
    await command.execute({ show: true });

    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Application key: [base64:mocked-base64-key]')
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should update existing APP_KEY in .env', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('APP_KEY=old-key\nOTHER_VAR=value');

    const command = KeyGenerateCommand.create();
    await command.execute({});

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('APP_KEY=base64:mocked-base64-key')
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('APP_KEY_BK=old-key')
    );
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Application key set successfully')
    );
  });

  it('should add APP_KEY if missing in .env', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('OTHER_VAR=value');

    const command = KeyGenerateCommand.create();
    await command.execute({});

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('APP_KEY=base64:mocked-base64-key')
    );
  });

  it('should create .env from .env.example if .env is missing', async () => {
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error('File not found')) // .env
      .mockResolvedValueOnce('APP_KEY=\nOTHER_VAR=example'); // .env.example

    const command = KeyGenerateCommand.create();
    await command.execute({});

    expect(fs.writeFile).toHaveBeenCalledTimes(2); // One for copying example, one for setting key
    expect(Logger.info).toHaveBeenCalledWith(
      expect.stringContaining('.env file created from .env.example')
    );
  });

  it('should handle failure to read .env and .env.example', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

    const command = KeyGenerateCommand.create();
    await command.execute({});

    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('.env file not found and .env.example not found')
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('APP_KEY=base64:mocked-base64-key')
    );
  });

  it('should handle write errors', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('APP_KEY=old-key');
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('Write failed'));

    const command = KeyGenerateCommand.create();
    await command.execute({});

    expect(Logger.error).toHaveBeenCalledWith('Failed to update .env file', expect.any(Error));
  });

  it('should update existing APP_KEY_BK in .env', async () => {
    const command = KeyGenerateCommand.create();
    vi.mocked(fs.readFile).mockResolvedValue('APP_KEY=old-key\nAPP_KEY_BK=older-key');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await command.execute({});

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.stringContaining('APP_KEY_BK=old-key')
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.env'),
      expect.not.stringContaining('APP_KEY_BK=older-key')
    );
  });

  it('should register options', () => {
    const command = KeyGenerateCommand.create();
    const mockCommander = {
      option: vi.fn().mockReturnThis(),
    } as any;

    // @ts-ignore - accessing private/internal property for testing
    command.addOptions(mockCommander);

    expect(mockCommander.option).toHaveBeenCalledWith('--show', expect.any(String));
    expect(mockCommander.option).toHaveBeenCalledWith('--force', expect.any(String));
  });
});
