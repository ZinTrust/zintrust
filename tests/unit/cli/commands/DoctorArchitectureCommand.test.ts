import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  getRuntimeMode: vi.fn(),
  envGetBool: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/runtime/detectRuntime', () => ({
  getRuntimeMode: (...args: any[]) => mocked.getRuntimeMode(...args),
}));

vi.mock('@config/env', () => ({
  Env: {
    getBool: (...args: any[]) => mocked.envGetBool(...args),
  },
}));

vi.mock('@config/logger', () => ({
  Logger: mocked.logger,
}));

describe('DoctorArchitectureCommand', () => {
  it('exits with critical issues in cloudflare-workers mode', async () => {
    mocked.getRuntimeMode.mockReturnValue('cloudflare-workers');
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'WORKER_ENABLED') return true;
      if (key === 'DOCKER_WORKER') return false;
      if (key === 'USE_REDIS_PROXY') return false;
      if (key === 'ENABLE_CLOUDFLARE_SOCKETS') return false;
      return fallback ?? false;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${String(code)}`);
    }) as never);

    const { DoctorArchitectureCommand } = await import('@cli/commands/DoctorArchitectureCommand');
    await expect(DoctorArchitectureCommand.create().execute({} as any)).rejects.toThrow('exit:1');
    expect(mocked.logger.error).toHaveBeenCalledWith('Found configuration issues:');

    exitSpy.mockRestore();
  });

  it('prints success when configuration is valid', async () => {
    mocked.getRuntimeMode.mockReturnValue('containers');
    mocked.envGetBool.mockImplementation((key: string, fallback?: boolean) => {
      if (key === 'WORKER_ENABLED') return true;
      if (key === 'DOCKER_WORKER') return false;
      return fallback ?? false;
    });

    const { DoctorArchitectureCommand } = await import('@cli/commands/DoctorArchitectureCommand');
    await DoctorArchitectureCommand.create().execute({} as any);
    expect(mocked.logger.info).toHaveBeenCalledWith(
      '✅ Architecture configuration looks valid for this runtime.'
    );
  });
});
