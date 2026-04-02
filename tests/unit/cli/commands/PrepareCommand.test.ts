import { materializeWranglerDevVars } from '@cli/cloudflare/CloudflareWranglerDevEnv';
import { PrepareCommand } from '@cli/commands/PrepareCommand';
import { DistPackager } from '@cli/utils/DistPackager';
import { SpawnUtil } from '@cli/utils/spawn';
import { resolveNpmPath } from '@common/index';
import { Logger } from '@config/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/utils/DistPackager', () => ({
  DistPackager: {
    prepare: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@common/index', () => ({
  resolveNpmPath: vi.fn(),
}));

vi.mock('@cli/cloudflare/CloudflareWranglerDevEnv', () => ({
  materializeWranglerDevVars: vi.fn(),
}));

describe('PrepareCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct name and description', () => {
    expect(PrepareCommand.name).toBe('prepare');
    expect(PrepareCommand.description).toBeDefined();
  });

  it('should prepare dist with default path', async () => {
    const command = PrepareCommand.getCommand();
    command.exitOverride();

    await command.parseAsync(['node', 'test']);

    expect(DistPackager.prepare).toHaveBeenCalledWith(
      expect.stringContaining('dist'),
      process.cwd()
    );
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Dist prepared'));
  });

  it('should prepare dist with custom path', async () => {
    const command = PrepareCommand.getCommand();
    command.exitOverride();

    await command.parseAsync(['node', 'test', '--dist', 'custom-dist']);

    expect(DistPackager.prepare).toHaveBeenCalledWith(
      expect.stringContaining('custom-dist'),
      process.cwd()
    );
  });

  it('should run npm link when --link is provided', async () => {
    const command = PrepareCommand.getCommand();
    command.exitOverride();
    vi.mocked(resolveNpmPath).mockReturnValue('npm');
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await command.parseAsync(['node', 'test', '--link']);

    expect(resolveNpmPath).toHaveBeenCalled();
    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledWith({
      command: 'npm',
      args: ['link'],
      cwd: process.cwd(),
    });
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Linked'));
  });

  it('should materialize Wrangler dev vars when --dev-vars is provided', async () => {
    const command = PrepareCommand.getCommand();
    command.exitOverride();
    vi.mocked(materializeWranglerDevVars).mockResolvedValue({
      filePath: '/workspace/.dev.vars.development',
      selectedKeys: ['APP_KEY', 'JWT_SECRET'],
      missingKeys: ['SESSION_SECRET'],
      values: { APP_KEY: 'app-key', JWT_SECRET: 'jwt-secret' },
    });

    await command.parseAsync(['node', 'test', '--dev-vars', 'development']);

    expect(materializeWranglerDevVars).toHaveBeenCalledWith({
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      envName: 'development',
      envPath: '.env',
      requireSelection: true,
    });
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Wrangler dev vars prepared'));
    expect(Logger.info).toHaveBeenCalledWith('Selected keys: 2');
    expect(Logger.info).toHaveBeenCalledWith('Missing keys: SESSION_SECRET');
  });

  it('should throw error if npm link fails', async () => {
    const command = PrepareCommand.getCommand();
    command.exitOverride();
    vi.mocked(resolveNpmPath).mockReturnValue('npm');
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(1);

    await expect(command.parseAsync(['node', 'test', '--link'])).rejects.toThrow('Prepare failed');
    expect(Logger.error).toHaveBeenCalledWith('Failed to prepare dist', expect.any(Error));
  });

  it('should handle errors during preparation', async () => {
    const command = PrepareCommand.getCommand();
    command.exitOverride();
    vi.mocked(DistPackager.prepare).mockImplementation(() => {
      throw new Error('Prep failed');
    });

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow('Prepare failed');
    expect(Logger.error).toHaveBeenCalledWith('Failed to prepare dist', expect.any(Error));
  });
});
