import { SpawnUtil } from '@cli/utils/spawn';
import { spawn } from '@node-singletons/child-process';
import { existsSync } from '@node-singletons/fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/child-process', () => ({
  spawn: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('@config/app', () => ({
  appConfig: {
    getSafeEnv: vi.fn(() => ({ SAFE: 'env' })),
    isDevelopment: vi.fn(() => true),
    isProduction: vi.fn(() => false),
  },
}));

describe('SpawnUtil', () => {
  const mockChild = {
    kill: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (spawn as any).mockReturnValue(mockChild);
    (existsSync as any).mockReturnValue(false);
  });

  it('spawns a command and returns exit code', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') {
        cb(0, null);
      }
    });

    const code = await SpawnUtil.spawnAndWait({
      command: 'ls',
      args: ['-la'],
    });

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      'ls',
      ['-la'],
      expect.objectContaining({
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { SAFE: 'env' },
        shell: false,
      })
    );
  });

  it('supports shell commands without local bin resolution', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') {
        cb(0, null);
      }
    });

    await SpawnUtil.spawnAndWait({
      command: 'echo hello',
      args: [],
      shell: true,
    });

    expect(spawn).toHaveBeenCalledWith(
      'echo hello',
      [],
      expect.objectContaining({
        shell: true,
      })
    );
  });

  it('resolves local bin if command is not a path', async () => {
    (existsSync as any).mockImplementation((path: string) =>
      path.endsWith('node_modules/.bin/my-cmd')
    );

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    await SpawnUtil.spawnAndWait({
      command: 'my-cmd',
      args: [],
      cwd: '/test',
    });

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/.bin/my-cmd'),
      [],
      expect.objectContaining({
        cwd: '/test',
      })
    );
  });

  it('falls back to the packaged core bin when the app root has no local binary', async () => {
    (existsSync as any).mockImplementation((candidate: string) => {
      if (candidate === '/test/node_modules/.bin/tsx') return false;
      return candidate.endsWith('node_modules/.bin/tsx');
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    await SpawnUtil.spawnAndWait({
      command: 'tsx',
      args: ['runner.ts'],
      cwd: '/test',
    });

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/.bin/tsx'),
      ['runner.ts'],
      expect.objectContaining({ cwd: '/test' })
    );
    expect(spawn).not.toHaveBeenCalledWith('tsx', ['runner.ts'], expect.any(Object));
    expect((spawn as any).mock.calls[0]?.[0]).not.toContain('/test/node_modules/.bin/tsx');
  });

  it('handles windows bin candidates', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    (existsSync as any).mockImplementation((path: string) => path.endsWith('.cmd'));

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    await SpawnUtil.spawnAndWait({
      command: 'my-cmd',
      args: [],
      cwd: '/test',
    });

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('my-cmd.cmd'),
      [],
      expect.any(Object)
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns 0 for SIGINT or SIGTERM', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(null, 'SIGINT');
    });

    const code = await SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
    });

    expect(code).toBe(0);
  });

  it('settles on exit events as well as close events', async () => {
    let exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'exit') exitHandler = cb as typeof exitHandler;
      if (event === 'close') closeHandler = cb as typeof closeHandler;
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
    });

    exitHandler?.(7, null);
    closeHandler?.(0, null);

    await expect(promise).resolves.toBe(7);
  });

  it('returns 1 for other signals', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(null, 'SIGKILL');
    });

    const code = await SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
    });

    expect(code).toBe(1);
  });

  it('forwards signals to child process', async () => {
    const onSpy = vi.spyOn(process, 'on');
    const offSpy = vi.spyOn(process, 'off');

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
    });

    // Get the signal handlers
    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as (
      ...args: any[]
    ) => void;
    const sigtermHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1] as (
      ...args: any[]
    ) => void;

    expect(sigintHandler).toBeDefined();
    expect(sigtermHandler).toBeDefined();

    sigintHandler();
    expect(mockChild.kill).toHaveBeenCalledWith('SIGINT');

    sigtermHandler();
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

    await promise;

    expect(offSpy).toHaveBeenCalledWith('SIGINT', sigintHandler);
    expect(offSpy).toHaveBeenCalledWith('SIGTERM', sigtermHandler);
  });

  it('handles signal forwarding errors', async () => {
    mockChild.kill.mockImplementation(() => {
      throw new Error('Kill failed');
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    const onSpy = vi.spyOn(process, 'on');

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
    });

    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as (
      ...args: any[]
    ) => void;

    expect(() => sigintHandler()).toThrow('Failed to forward signal to child process');

    await promise;
  });

  it('throws CLI error if command not found (ENOENT)', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'error') {
        const err = new Error('not found') as any;
        err.code = 'ENOENT';
        cb(err);
      }
    });

    await expect(
      SpawnUtil.spawnAndWait({
        command: 'nonexistent',
        args: [],
      })
    ).rejects.toThrow("Error: 'nonexistent' not found on PATH.");
  });

  it('provides tsx installation guidance when tsx is missing', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'error') {
        const err = new Error('not found') as any;
        err.code = 'ENOENT';
        cb(err);
      }
    });

    await expect(
      SpawnUtil.spawnAndWait({
        command: 'tsx',
        args: [],
      })
    ).rejects.toThrow(/npm install -D tsx/);
  });

  it('throws generic error for other spawn failures', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'error') {
        cb(new Error('spawn failed'));
      }
    });

    await expect(
      SpawnUtil.spawnAndWait({
        command: 'ls',
        args: [],
      })
    ).rejects.toThrow('Failed to spawn child process');
  });

  it('respects forwardSignals=false', async () => {
    const onSpy = vi.spyOn(process, 'on');

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    await SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
      forwardSignals: false,
    });

    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('uses delayed fallback forwarding in TTY mode when requested', async () => {
    vi.useFakeTimers();
    const onSpy = vi.spyOn(process, 'on');
    const originalIsTTY = process.stdin.isTTY;
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') closeHandler = cb as typeof closeHandler;
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 1500,
    });

    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as
      | (() => void)
      | undefined;

    expect(sigintHandler).toBeDefined();

    sigintHandler?.();
    expect(mockChild.kill).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1499);
    expect(mockChild.kill).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mockChild.kill).toHaveBeenCalledWith('SIGINT');

    closeHandler?.(0, null);
    await promise;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it('escalates the delayed TTY fallback when the child still has not exited', async () => {
    vi.useFakeTimers();
    const onSpy = vi.spyOn(process, 'on');
    const originalIsTTY = process.stdin.isTTY;
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

    mockChild.kill.mockImplementation(() => undefined);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') closeHandler = cb as typeof closeHandler;
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 1500,
    });

    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as
      | (() => void)
      | undefined;

    sigintHandler?.();

    await vi.advanceTimersByTimeAsync(1500);
    expect(mockChild.kill).toHaveBeenNthCalledWith(1, 'SIGINT');

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockChild.kill).toHaveBeenNthCalledWith(2, 'SIGTERM');

    closeHandler?.(0, null);
    await expect(promise).resolves.toBe(0);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it('clears a pending escalation timer when the child closes after fallback SIGINT', async () => {
    vi.useFakeTimers();
    const onSpy = vi.spyOn(process, 'on');
    const originalIsTTY = process.stdin.isTTY;
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

    mockChild.kill.mockImplementation(() => undefined);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') closeHandler = cb as typeof closeHandler;
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 1500,
    });

    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as
      | (() => void)
      | undefined;

    sigintHandler?.();
    await vi.advanceTimersByTimeAsync(1500);
    expect(mockChild.kill).toHaveBeenNthCalledWith(1, 'SIGINT');

    closeHandler?.(0, null);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe(0);
    expect(mockChild.kill).toHaveBeenCalledTimes(1);

    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it('relays traced child stdout and stderr stream events', async () => {
    const originalTraceValue = process.env.CLI_SPAWN_TRACE;
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true as never);
    const stdoutHandlers = new Map<string, (chunk?: string | Buffer) => void>();
    const stderrHandlers = new Map<string, (chunk?: string | Buffer) => void>();

    process.env.CLI_SPAWN_TRACE = 'true';
    mockChild.stdout.on.mockImplementation(
      (event: string, handler: (chunk?: string | Buffer) => void) => {
        stdoutHandlers.set(event, handler);
        return mockChild.stdout;
      }
    );
    mockChild.stderr.on.mockImplementation(
      (event: string, handler: (chunk?: string | Buffer) => void) => {
        stderrHandlers.set(event, handler);
        return mockChild.stderr;
      }
    );
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
    });

    stdoutHandlers.get('data')?.('hello');
    stdoutHandlers.get('end')?.();
    stdoutHandlers.get('close')?.();
    stderrHandlers.get('data')?.(Buffer.from('oops'));
    stderrHandlers.get('end')?.();
    stderrHandlers.get('close')?.();

    await expect(promise).resolves.toBe(0);
    expect(stdoutWrite).toHaveBeenCalledWith('hello');
    expect(stderrWrite).toHaveBeenCalledWith(Buffer.from('oops'));

    if (originalTraceValue === undefined) delete process.env.CLI_SPAWN_TRACE;
    else process.env.CLI_SPAWN_TRACE = originalTraceValue;
  });

  it('clears pending delayed SIGTERM forwarding when the child exits first', async () => {
    vi.useFakeTimers();
    const onSpy = vi.spyOn(process, 'on');
    const originalIsTTY = process.stdin.isTTY;
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') closeHandler = cb as typeof closeHandler;
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 1500,
    });

    const sigtermHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1] as
      | (() => void)
      | undefined;

    sigtermHandler?.();
    closeHandler?.(0, null);

    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).resolves.toBe(0);
    expect(mockChild.kill).not.toHaveBeenCalledWith('SIGTERM');

    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it('ignores delayed SIGTERM scheduling after the child has already closed', async () => {
    vi.useFakeTimers();
    const onSpy = vi.spyOn(process, 'on');
    const originalIsTTY = process.stdin.isTTY;
    let closeHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') closeHandler = cb as typeof closeHandler;
    });

    const promise = SpawnUtil.spawnAndWait({
      command: 'ls',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 1500,
    });

    const sigtermHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1] as
      | (() => void)
      | undefined;

    closeHandler?.(0, null);
    sigtermHandler?.();

    await vi.advanceTimersByTimeAsync(1500);
    await expect(promise).resolves.toBe(0);
    expect(mockChild.kill).not.toHaveBeenCalledWith('SIGTERM');

    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it('returns command as is if it contains path separators', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') cb(0, null);
    });

    await SpawnUtil.spawnAndWait({
      command: './my-script.sh',
      args: [],
    });

    expect(spawn).toHaveBeenCalledWith('./my-script.sh', [], expect.any(Object));

    await SpawnUtil.spawnAndWait({
      command: 'C:\\bin\\my-cmd.exe',
      args: [],
    });

    expect(spawn).toHaveBeenCalledWith('C:\\bin\\my-cmd.exe', [], expect.any(Object));
  });
});
