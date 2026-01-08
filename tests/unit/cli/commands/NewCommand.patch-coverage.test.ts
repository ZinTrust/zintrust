import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@common/index', () => ({
  resolvePackageManager: () => 'npm',
  extractErrorMessage: (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error occurred';
  },
}));

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: {
    prompt: vi.fn(),
    projectName: vi.fn(async () => 'my-zintrust-app'),
  },
}));

vi.mock('@cli/scaffolding/ProjectScaffolder', () => ({
  ProjectScaffolder: {
    scaffold: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@node-singletons/child-process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: vi.fn(async () => 0),
  },
}));

import { NewCommand } from '@/cli/commands/NewCommand';
import { PromptHelper } from '@cli/PromptHelper';
import { SpawnUtil } from '@cli/utils/spawn';

describe('NewCommand patch coverage', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CI;
    delete process.env.ZINTRUST_ALLOW_AUTO_INSTALL;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetAllMocks();
  });

  it('promptForPackageManager returns selected value from prompt', async () => {
    (PromptHelper.prompt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      packageManager: 'pnpm',
    });

    const command = NewCommand.create();
    const selected = await command.promptForPackageManager('npm');

    expect(selected).toBe('pnpm');
  });

  it('execute logs skip when packageManager is null (not selected)', async () => {
    const command = NewCommand.create();

    vi.spyOn(command, 'info');
    vi.spyOn(command, 'warn');
    vi.spyOn(command, 'success');

    // Avoid real prompts/scaffolding; only exercise installDependencies branch.
    command.getProjectConfig = vi.fn(async () => ({
      template: 'basic',
      database: 'sqlite',
      port: 3000,
      author: '',
      description: '',
    }));
    command.runScaffolding = vi.fn(async () => ({ success: true }));
    command.initializeGit = vi.fn();

    await command.execute({
      args: ['tmp-app'],
      git: false,
      install: true,
      'package-manager': null,
      interactive: false,
    } as any);

    expect(command.info).toHaveBeenCalledWith(
      '⏭️  Skipping dependency installation (not selected).'
    );
    expect(SpawnUtil.spawnAndWait).not.toHaveBeenCalled();
  });

  it('execute prompts for package manager and installs with selectedPm', async () => {
    const command = NewCommand.create();

    vi.spyOn(command, 'info');
    vi.spyOn(command, 'warn');
    vi.spyOn(command, 'success');

    command.getProjectConfig = vi.fn(async () => ({
      template: 'basic',
      database: 'sqlite',
      port: 3000,
      author: '',
      description: '',
    }));
    command.runScaffolding = vi.fn(async () => ({ success: true }));
    command.initializeGit = vi.fn();

    // This hits the `pm = selectedPm` branch in maybeInstallDependencies.
    command.promptForPackageManager = vi.fn(async () => 'pnpm');

    await command.execute({
      args: ['tmp-app'],
      git: false,
      install: true,
      interactive: true,
    } as any);

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalled();
    expect((SpawnUtil.spawnAndWait as any).mock.calls[0][0].command).toBe('pnpm');
  });

  it('normalizes database option: postgres -> postgresql', async () => {
    const command = NewCommand.create();

    const cfg = await command.getProjectConfig('tmp-app', {
      database: 'postgres',
      interactive: false,
    } as any);

    expect(cfg.database).toBe('postgresql');
  });

  it('normalizes database option: mongodb', async () => {
    const command = NewCommand.create();

    const cfg = await command.getProjectConfig('tmp-app', {
      database: 'mongodb',
      interactive: false,
    } as any);

    expect(cfg.database).toBe('mongodb');
  });

  it('normalizes database option: unknown -> sqlite', async () => {
    const command = NewCommand.create();

    const cfg = await command.getProjectConfig('tmp-app', {
      database: 'totally-unknown',
      interactive: false,
    } as any);

    expect(cfg.database).toBe('sqlite');
  });
});
