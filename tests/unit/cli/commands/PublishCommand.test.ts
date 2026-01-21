import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '@config/logger';
import path from '@node-singletons/path';

vi.mock('@config/logger', () => {
  return {
    Logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      success: vi.fn(),
    },
  };
});

vi.mock('@node-singletons/fs', () => {
  const existsSync = vi.fn();
  const mkdirSync = vi.fn();
  const copyFileSync = vi.fn();
  return {
    default: { existsSync, mkdirSync, copyFileSync },
    existsSync,
    mkdirSync,
    copyFileSync,
  };
});

describe('PublishCommand', () => {
  const warnSpy = Logger.warn as unknown as ReturnType<typeof vi.fn>;
  const infoSpy = Logger.info as unknown as ReturnType<typeof vi.fn>;
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/repo');

  const getFsMock = async () => {
    const fsModule = await import('@node-singletons/fs');
    const fsMock = (fsModule.default ?? fsModule) as unknown as {
      existsSync: ReturnType<typeof vi.fn>;
      mkdirSync: ReturnType<typeof vi.fn>;
      copyFileSync: ReturnType<typeof vi.fn>;
    };
    return fsMock;
  };

  beforeEach(() => {
    warnSpy.mockClear();
    infoSpy.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cwdSpy.mockClear();
  });

  it('warns when no option is provided', async () => {
    const { PublishCommand } = await import('@cli/commands/PublishCommand');

    await PublishCommand.create().execute({});

    expect(warnSpy).toHaveBeenCalledWith(
      'Please specify a configuration to publish (e.g., --queue-monitor)'
    );
  });

  it('warns when the config already exists', async () => {
    const fsMock = await getFsMock();
    const { PublishCommand } = await import('@cli/commands/PublishCommand');

    const targetPath = path.join('/repo', 'config', 'queueMonitor.ts');

    fsMock.existsSync.mockImplementation((p: string) => p === targetPath);

    await PublishCommand.create().execute({ queueMonitor: true });

    expect(warnSpy).toHaveBeenCalledWith(
      'Configuration file already exists: config/queueMonitor.ts'
    );
  });

  it('publishes the queue monitor config when source exists', async () => {
    const fsMock = await getFsMock();
    const { PublishCommand } = await import('@cli/commands/PublishCommand');

    const targetPath = path.join('/repo', 'config', 'queueMonitor.ts');
    const nodeModulesPath = path.join(
      '/repo',
      'node_modules',
      '@zintrust',
      'queue-monitor',
      'src',
      'config',
      'queueMonitor.ts'
    );
    const configDir = path.dirname(targetPath);

    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === targetPath) return false;
      if (p === nodeModulesPath) return true;
      if (p === configDir) return false;
      return false;
    });

    await PublishCommand.create().execute({ queueMonitor: true });

    expect(fsMock.mkdirSync).toHaveBeenCalledWith(configDir, { recursive: true });
    expect(fsMock.copyFileSync).toHaveBeenCalledWith(nodeModulesPath, targetPath);
    expect(infoSpy).toHaveBeenCalledWith('Published configuration: config/queueMonitor.ts');
  });

  it('publishes the queue monitor config from monorepo path', async () => {
    const fsMock = await getFsMock();
    const { PublishCommand } = await import('@cli/commands/PublishCommand');

    const targetPath = path.join('/repo', 'config', 'queueMonitor.ts');
    const nodeModulesPath = path.join(
      '/repo',
      'node_modules',
      '@zintrust',
      'queue-monitor',
      'src',
      'config',
      'queueMonitor.ts'
    );
    const monorepoPath = path.join(
      '/repo',
      'packages',
      'queue-monitor',
      'src',
      'config',
      'queueMonitor.ts'
    );
    const configDir = path.dirname(targetPath);

    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === targetPath) return false;
      if (p === nodeModulesPath) return false;
      if (p === monorepoPath) return true;
      if (p === configDir) return true;
      return false;
    });

    await PublishCommand.create().execute({ queueMonitor: true });

    expect(fsMock.copyFileSync).toHaveBeenCalledWith(monorepoPath, targetPath);
    expect(infoSpy).toHaveBeenCalledWith('Published configuration: config/queueMonitor.ts');
  });

  it('throws when the source config cannot be found', async () => {
    const fsMock = await getFsMock();
    const { PublishCommand } = await import('@cli/commands/PublishCommand');

    fsMock.existsSync.mockReturnValue(false);

    await expect(PublishCommand.create().execute({ queueMonitor: true })).rejects.toThrow(
      'Could not locate source configuration file.'
    );
  });
});
