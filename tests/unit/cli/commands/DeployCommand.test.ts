import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  spawnAndWait: vi.fn(),
  existsSync: vi.fn(),
  join: vi.fn((...parts: string[]) => parts.join('/')),
  syncCloudflareSecrets: vi.fn(),
  reportCloudflareSecretSync: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: {
    spawnAndWait: (...args: any[]) => mocked.spawnAndWait(...args),
  },
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: any[]) => mocked.existsSync(...args),
}));

vi.mock('@node-singletons/path', () => ({
  join: (...args: any[]) => mocked.join(...args),
}));

vi.mock('@config/logger', () => ({
  Logger: mocked.logger,
}));

vi.mock('@cli/cloudflare/CloudflareSecretSync', () => ({
  syncCloudflareSecrets: (...args: any[]) => mocked.syncCloudflareSecrets(...args),
  reportCloudflareSecretSync: (...args: any[]) => mocked.reportCloudflareSecretSync(...args),
}));

describe('DeployCommand', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocked.existsSync.mockReturnValue(true);
    mocked.spawnAndWait.mockResolvedValue(0);
    mocked.syncCloudflareSecrets.mockResolvedValue({
      selectedKeys: [],
      pushedKeys: [],
      failures: [],
      dryRun: false,
    });
  });

  it('deploys container stack with cw target using docker compose', async () => {
    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await cmd.execute({ args: ['cw'] });

    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'docker', args: expect.arrayContaining(['compose']) })
    );
    expect(mocked.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Deploying container workers stack')
    );
  });

  it('falls back to docker-compose when docker is missing', async () => {
    mocked.spawnAndWait
      .mockRejectedValueOnce(new Error("'docker' not found"))
      .mockResolvedValueOnce(0);

    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await cmd.execute({ args: ['cw'] });

    expect(mocked.logger.warn).toHaveBeenCalledWith(
      "'docker' not found. Falling back to 'docker-compose'."
    );
    expect(mocked.spawnAndWait).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'docker-compose' })
    );
  });

  it('deploys proxy stack with cp/proxy target', async () => {
    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await cmd.execute({ args: ['proxy'] });

    expect(mocked.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Deploying proxy stack')
    );
    expect(mocked.spawnAndWait).toHaveBeenCalled();
  });

  it('throws a CLI error when compose file is missing', async () => {
    mocked.existsSync.mockReturnValue(false);

    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await expect(cmd.execute({ args: ['cw'] })).rejects.toThrow();
  });

  it('deploys via wrangler when target is an environment name (env option overrides)', async () => {
    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await cmd.execute({ args: ['worker'], env: 'production' });

    expect(mocked.syncCloudflareSecrets).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: process.cwd(),
        wranglerEnvs: ['production'],
        envPath: '.env',
        requireSelection: false,
      })
    );
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'wrangler', args: ['deploy', '--env', 'production'] })
    );
  });

  it('reports synced secrets before wrangler deploy when keys are selected', async () => {
    mocked.syncCloudflareSecrets.mockResolvedValueOnce({
      selectedKeys: ['APP_KEY'],
      pushedKeys: ['APP_KEY'],
      failures: [],
      dryRun: false,
    });

    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await cmd.execute({ args: ['worker'] });

    expect(mocked.reportCloudflareSecretSync).toHaveBeenCalledTimes(1);
  });

  it('skips secret sync when disabled', async () => {
    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await cmd.execute({ args: ['worker'], syncSecrets: false });

    expect(mocked.syncCloudflareSecrets).not.toHaveBeenCalled();
    expect(mocked.spawnAndWait).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'wrangler', args: ['deploy', '--env', 'worker'] })
    );
  });

  it('exits process when wrangler returns non-zero', async () => {
    mocked.spawnAndWait.mockResolvedValueOnce(12);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    const { DeployCommand } = await import('@cli/commands/DeployCommand');
    const cmd = DeployCommand.create();

    await expect(cmd.execute({ args: ['worker'] })).rejects.toThrow('exit:12');
    exitSpy.mockRestore();
  });
});
