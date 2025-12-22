import { afterEach, describe, expect, it, vi } from 'vitest';

const scanState = vi.hoisted(() => {
  let exitHandler: ((code: number | null) => void) | undefined;

  return {
    binExists: true,
    captureExitHandler(handler: (code: number | null) => void) {
      exitHandler = handler;
    },
    triggerExit(code: number | null) {
      exitHandler?.(code);
    },
    reset() {
      exitHandler = undefined;
      this.binExists = true;
    },
  };
});

const osState = vi.hoisted(() => {
  return {
    platform: 'darwin',
    reset() {
      this.platform = 'darwin';
    },
  };
});

vi.mock('node:os', () => {
  return {
    platform: () => osState.platform,
  };
});

vi.mock('node:fs', () => {
  return {
    existsSync: vi.fn((p: unknown) => {
      const value = String(p);
      if (value.endsWith('/.env')) return false;
      if (value.includes('node_modules') && value.includes('sonar-scanner'))
        return scanState.binExists;
      return false;
    }),
    readFileSync: vi.fn(() => ''),
  };
});

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(() => {
      return {
        on: (event: string, cb: (code: number | null) => void) => {
          if (event === 'exit') scanState.captureExitHandler(cb);
        },
      };
    }),
  };
});

describe('scripts/sonar-scan', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    scanState.reset();
    osState.reset();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('spawns sonar-scanner and exits with default code when child exit code is null', async () => {
    process.argv = ['node', 'sonar-scan.ts', '--debug'];

    vi.resetModules();

    const exitMock: typeof process.exit = ((code?: number) => {
      throw new Error(`process.exit:${code ?? 'undefined'}`);
    }) as unknown as typeof process.exit;
    process.exit = exitMock;

    const childProcess = await import('node:child_process');

    await import('@scripts/sonar-scan');

    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(childProcess.spawn).mock.calls[0]?.[1]).toEqual(['--debug']);

    expect(() => scanState.triggerExit(null)).toThrow(/process\.exit:1/);
  });

  it('throws if sonar-scanner binary is missing', async () => {
    vi.resetModules();
    scanState.binExists = false;
    process.argv = ['node', 'sonar-scan.ts'];

    await expect(import('@scripts/sonar-scan')).rejects.toThrow(/sonar-scanner not found/i);
  });

  it('uses win32 scanner name and safe PATH when platform is win32', async () => {
    osState.platform = 'win32';
    vi.resetModules();
    process.argv = ['node', 'sonar-scan.ts'];

    const os = await import('node:os');
    expect(os.platform()).toBe('win32');

    const childProcess = await import('node:child_process');
    await import('@scripts/sonar-scan');

    expect(vi.mocked(childProcess.spawn)).toHaveBeenCalled();
    const spawnCall = vi.mocked(childProcess.spawn).mock.calls.at(-1);
    expect(String(spawnCall?.[0])).toMatch(/sonar-scanner\.cmd$/);

    const spawnOptions = spawnCall?.[2] as unknown as { env?: Record<string, string> };
    expect(spawnOptions.env?.['PATH']).toContain(String.raw`C:\Windows\System32`);
  });
});
