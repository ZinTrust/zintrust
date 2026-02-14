import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@cli/PromptHelper', () => ({
  PromptHelper: { confirm: vi.fn() },
}));

vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

vi.mock('@node-singletons/fs', () => ({
  copyFileSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn() },
}));

describe('Container/Producer/Deploy patch coverage', () => {
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (process as { cwd: typeof process.cwd }).cwd = originalCwd;
  });

  it('InitContainerCommand writes compose and Dockerfile when absent', async () => {
    const nodeFs = await import('@node-singletons/fs');
    vi.mocked(nodeFs.existsSync).mockReturnValue(false);

    const { InitContainerCommand } = await import('@cli/commands/InitContainerCommand');
    await InitContainerCommand.create().execute({});

    expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it('InitContainerCommand skips files when overwrite is declined', async () => {
    const nodeFs = await import('@node-singletons/fs');
    const { PromptHelper } = await import('@cli/PromptHelper');

    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(PromptHelper.confirm).mockResolvedValue(false);

    const { InitContainerCommand } = await import('@cli/commands/InitContainerCommand');
    await InitContainerCommand.create().execute({});

    expect(PromptHelper.confirm).toHaveBeenCalledTimes(2);
    expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('InitContainerCommand backs up existing files before overwrite', async () => {
    const nodeFs = await import('@node-singletons/fs');
    const { PromptHelper } = await import('@cli/PromptHelper');

    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(PromptHelper.confirm).mockResolvedValue(true);

    const { InitContainerCommand } = await import('@cli/commands/InitContainerCommand');
    await InitContainerCommand.create().execute({});

    expect(nodeFs.copyFileSync).toHaveBeenCalledTimes(2);
    expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it('InitProducerCommand handles missing wrangler and patches WORKER_ENABLED', async () => {
    const nodeFs = await import('@node-singletons/fs');
    const { Logger } = await import('@config/logger');

    vi.mocked(nodeFs.existsSync).mockReturnValueOnce(false);

    const { InitProducerCommand } = await import('@cli/commands/InitProducerCommand');
    await InitProducerCommand.create().execute({});
    expect(Logger.error).toHaveBeenCalled();

    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(nodeFs.readFileSync).mockReturnValue('{"vars": {"WORKER_ENABLED": "true"}}' as any);

    await InitProducerCommand.create().execute({});
    expect(nodeFs.writeFileSync).toHaveBeenCalledWith(
      '/project/wrangler.jsonc',
      expect.stringContaining('"WORKER_ENABLED": "false"')
    );
  });

  it('InitProducerCommand injects vars when WORKER_ENABLED is missing', async () => {
    const nodeFs = await import('@node-singletons/fs');
    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(nodeFs.readFileSync).mockReturnValue('{"name":"app","vars": {"A":"B"}}' as any);

    const { InitProducerCommand } = await import('@cli/commands/InitProducerCommand');
    await InitProducerCommand.create().execute({});

    expect(nodeFs.writeFileSync).toHaveBeenCalledWith(
      '/project/wrangler.jsonc',
      expect.stringContaining('"QUEUE_ENABLED": "true"')
    );
  });

  it('InitProducerCommand keeps file unchanged when vars block is missing', async () => {
    const nodeFs = await import('@node-singletons/fs');
    const { Logger } = await import('@config/logger');
    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(nodeFs.readFileSync).mockReturnValue('{"name":"app"}' as any);

    const { InitProducerCommand } = await import('@cli/commands/InitProducerCommand');
    await InitProducerCommand.create().execute({});

    expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
    expect(Logger.info).toHaveBeenCalledWith(
      'wrangler.jsonc configuration appears correct or could not be automatically patched.'
    );
  });

  it('DeployContainerWorkersCommand throws when compose file is missing', async () => {
    const nodeFs = await import('@node-singletons/fs');
    vi.mocked(nodeFs.existsSync).mockReturnValue(false);

    const { DeployContainerWorkersCommand } =
      await import('@cli/commands/DeployContainerWorkersCommand');

    await expect(DeployContainerWorkersCommand.create().execute({})).rejects.toThrow(
      /docker-compose\.workers\.yml not found/
    );
  });

  it('DeployContainerWorkersCommand falls back to docker-compose when docker is missing', async () => {
    const nodeFs = await import('@node-singletons/fs');
    const { SpawnUtil } = await import('@cli/utils/spawn');
    const { Logger } = await import('@config/logger');

    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(SpawnUtil.spawnAndWait)
      .mockRejectedValueOnce(new Error("'docker' not found"))
      .mockResolvedValueOnce(0);

    const { DeployContainerWorkersCommand } =
      await import('@cli/commands/DeployContainerWorkersCommand');
    await DeployContainerWorkersCommand.create().execute({ noBuild: false, removeOrphans: true });

    expect(Logger.warn).toHaveBeenCalledWith(
      "'docker' not found. Falling back to 'docker-compose'."
    );
    expect(SpawnUtil.spawnAndWait).toHaveBeenNthCalledWith(2, {
      command: 'docker-compose',
      args: [
        '-f',
        '/project/docker-compose.workers.yml',
        'up',
        '-d',
        '--build',
        '--remove-orphans',
      ],
    });
  });

  it('DeployContainerWorkersCommand exits on non-zero compose exit code', async () => {
    const nodeFs = await import('@node-singletons/fs');
    const { SpawnUtil } = await import('@cli/utils/spawn');

    vi.mocked(nodeFs.existsSync).mockReturnValue(true);
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(7);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    const { DeployContainerWorkersCommand } =
      await import('@cli/commands/DeployContainerWorkersCommand');

    await expect(DeployContainerWorkersCommand.create().execute({})).rejects.toThrow('exit:7');
    exitSpy.mockRestore();
  });
});
