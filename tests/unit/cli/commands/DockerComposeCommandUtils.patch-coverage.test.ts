import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DockerComposeCommandUtils patch coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('exits when docker command returns non-zero', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: {
        spawnAndWait: vi.fn(async ({ command }: { command: string }) => {
          if (command === 'docker') return 7;
          return 0;
        }),
      },
    }));

    const { runComposeWithFallback } = await import('@cli/commands/DockerComposeCommandUtils');
    await expect(runComposeWithFallback(['compose', 'up'])).rejects.toThrow('exit:7');
    exitSpy.mockRestore();
  });

  it('falls back to docker-compose when docker is missing', async () => {
    const warn = vi.fn();
    vi.doMock('@config/logger', () => ({ Logger: { warn } }));

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: {
        spawnAndWait: vi.fn(async ({ command }: { command: string }) => {
          if (command === 'docker') throw new Error("'docker' not found");
          return 0;
        }),
      },
    }));

    const { runComposeWithFallback } = await import('@cli/commands/DockerComposeCommandUtils');
    await expect(runComposeWithFallback(['compose', 'logs'])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('exits when docker-compose fallback returns non-zero', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: {
        spawnAndWait: vi.fn(async ({ command }: { command: string }) => {
          if (command === 'docker') throw new Error("'docker' not found");
          return 9;
        }),
      },
    }));

    const { runComposeWithFallback } = await import('@cli/commands/DockerComposeCommandUtils');
    await expect(runComposeWithFallback(['compose', 'up'])).rejects.toThrow('exit:9');
    exitSpy.mockRestore();
  });
});
