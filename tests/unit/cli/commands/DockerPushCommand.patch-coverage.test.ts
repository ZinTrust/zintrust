/* eslint-disable max-nested-callbacks */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DockerPushCommand (patch coverage)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('publishes runtime, worker, and gateway images via docker buildx', async () => {
    const spawnAndWait = vi.fn(async () => 0);
    vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

    const { DockerPushCommand } = await import('@cli/commands/DockerPushCommand');

    await DockerPushCommand.create().execute({
      args: [],
      tag: '1.2.3',
      platforms: 'linux/amd64,linux/arm64',
      only: 'both',
    } as any);

    expect(spawnAndWait).toHaveBeenCalledTimes(3);

    // Runtime image
    expect(spawnAndWait).toHaveBeenNthCalledWith(1, {
      command: 'docker',
      args: expect.arrayContaining([
        'buildx',
        'build',
        '--platform',
        'linux/amd64,linux/arm64',
        '-t',
        'zintrust/zintrust:1.2.3',
        '-t',
        'zintrust/zintrust:latest',
        '--target',
        'runtime',
        '--push',
        '.',
      ]),
      env: expect.any(Object),
    });

    // Worker image
    expect(spawnAndWait).toHaveBeenNthCalledWith(2, {
      command: 'docker',
      args: expect.arrayContaining([
        'buildx',
        'build',
        '--platform',
        'linux/amd64,linux/arm64',
        '-t',
        'zintrust/zintrust-worker:1.2.3',
        '-t',
        'zintrust/zintrust-worker:latest',
        '--target',
        'worker',
        '--push',
        '.',
      ]),
      env: expect.any(Object),
    });

    // Gateway image
    expect(spawnAndWait).toHaveBeenNthCalledWith(3, {
      command: 'docker',
      args: expect.arrayContaining([
        'buildx',
        'build',
        '--platform',
        'linux/amd64,linux/arm64',
        '-t',
        'zintrust/zintrust-proxy-gateway:1.2.3',
        '-t',
        'zintrust/zintrust-proxy-gateway:latest',
        '--push',
        './docker/proxy-gateway',
      ]),
      env: expect.any(Object),
    });
  });

  it('publishes only runtime image when --only runtime', async () => {
    const spawnAndWait = vi.fn(async () => 0);
    vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

    const { DockerPushCommand } = await import('@cli/commands/DockerPushCommand');

    await DockerPushCommand.create().execute({
      args: [],
      tag: '1.2.3',
      platforms: 'linux/amd64',
      alsoLatest: false,
      only: 'runtime',
    } as any);

    expect(spawnAndWait).toHaveBeenCalledTimes(1);
    expect(spawnAndWait).toHaveBeenCalledWith({
      command: 'docker',
      args: expect.arrayContaining([
        'buildx',
        'build',
        '--platform',
        'linux/amd64',
        '-t',
        'zintrust/zintrust:1.2.3',
        '--target',
        'runtime',
        '--push',
        '.',
      ]),
      env: expect.any(Object),
    });

    const argList = (spawnAndWait.mock.calls[0]?.[0] as any)?.args as string[];
    expect(argList.join(' ')).not.toContain('zintrust/zintrust-proxy-gateway');
    expect(argList.join(' ')).not.toContain(':latest');
  });

  it('defaults to current version tag + latest when --tag is omitted', async () => {
    const spawnAndWait = vi.fn(async () => 0);
    vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));
    vi.doMock('@cli/services/VersionChecker', () => ({
      VersionChecker: {
        getCurrentVersion: () => '9.9.9',
      },
    }));

    const { DockerPushCommand } = await import('@cli/commands/DockerPushCommand');

    await DockerPushCommand.create().execute({
      args: [],
      platforms: 'linux/amd64',
      only: 'gateway',
    } as any);

    expect(spawnAndWait).toHaveBeenCalledTimes(1);
    expect(spawnAndWait).toHaveBeenCalledWith({
      command: 'docker',
      args: expect.arrayContaining([
        'buildx',
        'build',
        '--platform',
        'linux/amd64',
        '-t',
        'zintrust/zintrust-proxy-gateway:9.9.9',
        '-t',
        'zintrust/zintrust-proxy-gateway:latest',
        '--push',
        './docker/proxy-gateway',
      ]),
      env: expect.any(Object),
    });
  });

  it('publishes only worker image when --only worker', async () => {
    const spawnAndWait = vi.fn(async () => 0);
    vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

    const { DockerPushCommand } = await import('@cli/commands/DockerPushCommand');

    await DockerPushCommand.create().execute({
      args: [],
      tag: '1.2.3',
      platforms: 'linux/amd64',
      alsoLatest: false,
      only: 'worker',
    } as any);

    expect(spawnAndWait).toHaveBeenCalledTimes(1);
    expect(spawnAndWait).toHaveBeenCalledWith({
      command: 'docker',
      args: expect.arrayContaining([
        'buildx',
        'build',
        '--platform',
        'linux/amd64',
        '-t',
        'zintrust/zintrust-worker:1.2.3',
        '--target',
        'worker',
        '--push',
        '.',
      ]),
      env: expect.any(Object),
    });
  });

  it('throws CliError if docker buildx fails', async () => {
    const spawnAndWait = vi.fn(async () => 1); // simulate failure
    vi.doMock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait } }));
    vi.doMock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn() } }));

    const { DockerPushCommand } = await import('@cli/commands/DockerPushCommand');

    await expect(
      DockerPushCommand.create().execute({
        args: [],
        tag: '1.2.3',
        only: 'runtime',
      } as any)
    ).rejects.toThrow('Failed to publish zintrust/zintrust (exit code 1)');
  });
});
