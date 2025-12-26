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
  },
}));

describe('SpawnUtil', () => {
  const mockChild = {
    kill: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (spawn as any).mockReturnValue(mockChild);
    (existsSync as any).mockReturnValue(false);
  });

  it('spawns a command and returns exit code', async () => {
    mockChild.once.mockImplementation((event, cb) => {
      if (event === 'close') {
        setTimeout(() => cb(0, null), 0);
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
        stdio: 'inherit',
        env: { SAFE: 'env' },
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
    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as Function;
    const sigtermHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1] as Function;

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

    const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as Function;

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

    expect(onSpy).not.toHaveBeenCalledWith('SIGINT', expect.any(Function));
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
