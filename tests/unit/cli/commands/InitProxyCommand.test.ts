import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
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

vi.mock('@config/logger', () => ({ Logger: mocked.logger }));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: any[]) => mocked.existsSync(...args),
  mkdirSync: (...args: any[]) => mocked.mkdirSync(...args),
  writeFileSync: (...args: any[]) => mocked.writeFileSync(...args),
  copyFileSync: (...args: any[]) => mocked.copyFileSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...args: any[]) => mocked.join(...args),
}));

describe('InitProxyCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.resetModules();
    vi.clearAllMocks();
    mocked.confirm.mockResolvedValue(true);

    vi.spyOn(process, 'cwd').mockReturnValue('/proj');
  });

  it('writes scaffold files and handles overwrite prompts', async () => {
    // Simulate compose file exists (prompt), but nginx config/dockerfile do not.
    mocked.existsSync.mockImplementation((p: string) => {
      if (p.endsWith('docker-compose.proxy.yml')) return true;
      if (p.includes('docker/proxy-gateway')) return false;
      return false;
    });

    const { InitProxyCommand } = await import('@cli/commands/InitProxyCommand');
    await InitProxyCommand.create().execute({} as any);

    expect(mocked.confirm).toHaveBeenCalled();
    expect(mocked.writeFileSync).toHaveBeenCalled();
    expect(mocked.logger.info).toHaveBeenCalledWith('✅ Proxy stack scaffolding complete.');
  });

  it('skips writing when user declines overwrite', async () => {
    mocked.existsSync.mockReturnValue(true);
    mocked.confirm.mockResolvedValue(false);

    const { InitProxyCommand } = await import('@cli/commands/InitProxyCommand');
    await InitProxyCommand.create().execute({} as any);

    expect(mocked.writeFileSync).not.toHaveBeenCalled();
    expect(mocked.logger.info).toHaveBeenCalledWith('Skipped docker-compose.proxy.yml');
  });
});
