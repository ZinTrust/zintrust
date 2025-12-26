import { PluginCommand } from '@cli/commands/PluginCommand';
import { Logger } from '@config/logger';
import { PluginManager } from '@runtime/PluginManager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@runtime/PluginManager', () => ({
  PluginManager: {
    list: vi.fn(),
    isInstalled: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PluginCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  it('should have correct name and description', () => {
    const command = PluginCommand.create();
    expect(command.name).toBe('plugin');
    expect(command.description).toBeDefined();
  });

  it('should list plugins when --list is provided', async () => {
    const command = PluginCommand.create();
    vi.mocked(PluginManager.list).mockReturnValue({
      'test-plugin': { description: 'Test Description', aliases: ['tp'] },
    } as any);
    vi.mocked(PluginManager.isInstalled).mockResolvedValue(true);

    await command.execute({ list: true });

    expect(PluginManager.list).toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Available Plugins'));
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('test-plugin'));
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('✓ Installed'));
  });

  it('should install plugin when --install is provided', async () => {
    const command = PluginCommand.create();
    vi.mocked(PluginManager.install).mockResolvedValue(undefined);

    await command.execute({ install: 'test-plugin' });

    expect(PluginManager.install).toHaveBeenCalledWith('test-plugin');
  });

  it('should uninstall plugin when --uninstall is provided', async () => {
    const command = PluginCommand.create();
    vi.mocked(PluginManager.uninstall).mockResolvedValue(undefined);

    await command.execute({ uninstall: 'test-plugin' });

    expect(PluginManager.uninstall).toHaveBeenCalledWith('test-plugin');
  });

  it('should show help message when no options provided', async () => {
    const command = PluginCommand.create();

    await command.execute({});

    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Use "plugin list"'));
  });

  it('should handle install error', async () => {
    const command = PluginCommand.create();
    vi.mocked(PluginManager.install).mockRejectedValue(new Error('Install failed'));

    await expect(command.execute({ install: 'test-plugin' })).rejects.toThrow('process.exit');
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to install'),
      expect.any(Error)
    );
  });

  it('should handle uninstall error', async () => {
    const command = PluginCommand.create();
    vi.mocked(PluginManager.uninstall).mockRejectedValue(new Error('Uninstall failed'));

    await expect(command.execute({ uninstall: 'test-plugin' })).rejects.toThrow('process.exit');
    expect(Logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to uninstall'),
      expect.any(Error)
    );
  });

  it('should register options and subcommands', () => {
    const command = PluginCommand.create();
    const mockCommander = {
      alias: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      command: vi.fn().mockReturnValue({
        alias: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
      }),
    } as any;

    // @ts-ignore
    command.addOptions(mockCommander);

    expect(mockCommander.alias).toHaveBeenCalledWith('p');
    expect(mockCommander.option).toHaveBeenCalledWith(
      '-i, --install <pluginId>',
      expect.any(String)
    );
    expect(mockCommander.command).toHaveBeenCalledWith('list');
    expect(mockCommander.command).toHaveBeenCalledWith('install <pluginId>');
    expect(mockCommander.command).toHaveBeenCalledWith('uninstall <pluginId>');
  });

  it('should handle list subcommand', async () => {
    const command = PluginCommand.create().getCommand();
    command.exitOverride();
    vi.mocked(PluginManager.list).mockReturnValue({});

    await command.parseAsync(['node', 'test', 'list']);
    expect(PluginManager.list).toHaveBeenCalled();
  });

  it('should handle install subcommand', async () => {
    const command = PluginCommand.create().getCommand();
    command.exitOverride();
    vi.mocked(PluginManager.install).mockResolvedValue(undefined);

    await command.parseAsync(['node', 'test', 'install', 'test-plugin']);
    expect(PluginManager.install).toHaveBeenCalledWith('test-plugin');
  });

  it('should handle uninstall subcommand', async () => {
    const command = PluginCommand.create().getCommand();
    command.exitOverride();
    vi.mocked(PluginManager.uninstall).mockResolvedValue(undefined);

    await command.parseAsync(['node', 'test', 'uninstall', 'test-plugin']);
    expect(PluginManager.uninstall).toHaveBeenCalledWith('test-plugin');
  });
});
