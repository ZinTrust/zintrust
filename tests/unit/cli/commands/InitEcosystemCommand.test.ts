import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  existsSync: vi.fn(),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: {
    confirm: (...args: any[]) => mocked.confirm(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: mocked.logger,
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: any[]) => mocked.existsSync(...args),
  copyFileSync: (...args: any[]) => mocked.copyFileSync(...args),
  readFileSync: (...args: any[]) => mocked.readFileSync(...args),
  writeFileSync: (...args: any[]) => mocked.writeFileSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...args: any[]) => mocked.join(...args),
}));

vi.mock('@node-singletons/url', async (importOriginal) => {
  // Keep real fileURLToPath; it doesn't touch disk.
  return importOriginal();
});

describe('InitEcosystemCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.resetModules();
    vi.clearAllMocks();

    mocked.readFileSync.mockReturnValue('template');
    mocked.existsSync.mockReturnValue(false);
    mocked.confirm.mockResolvedValue(true);
  });

  it('writes both scaffold files when they do not exist', async () => {
    const { InitEcosystemCommand } = await import('@cli/commands/InitEcosystemCommand');
    const cmd = InitEcosystemCommand.create();
    await cmd.execute({});

    expect(mocked.writeFileSync).toHaveBeenCalledTimes(2);
    expect(mocked.logger.info).toHaveBeenCalledWith('✅ Ecosystem scaffolding complete.');
  });

  it('skips overwrite when user declines confirmation', async () => {
    mocked.existsSync.mockReturnValue(true);
    mocked.confirm.mockResolvedValue(false);

    const { InitEcosystemCommand } = await import('@cli/commands/InitEcosystemCommand');
    await InitEcosystemCommand.create().execute({});

    expect(mocked.logger.info).toHaveBeenCalledWith('Skipped docker-compose.ecosystem.yml');
    expect(mocked.logger.info).toHaveBeenCalledWith('Skipped docker-compose.schedules.yml');
    expect(mocked.writeFileSync).not.toHaveBeenCalled();
  });
});
