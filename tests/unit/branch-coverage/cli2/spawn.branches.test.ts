import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  existsSync: vi.fn((_path: string) => false),
  getSafeEnv: vi.fn(() => ({ SAFE: 'env' })),
  stderrWrite: vi.fn(),
  processHandlers: {} as Record<string, Array<() => void>>,
}));

vi.mock('@node-singletons/child-process', () => ({ spawn: (...args: unknown[]) => mocks.spawn(...args) }));
vi.mock('@node-singletons/fs', () => ({
  existsSync: (...args: unknown[]) => (mocks.existsSync as (...a: any[]) => any)(...args),
}));
vi.mock('@config/app', () => ({
  appConfig: { getSafeEnv: (...args: unknown[]) => (mocks.getSafeEnv as (...a: any[]) => any)(...args) },
}));

import { SpawnUtil } from '@cli/utils/spawn';

type Handler = (...args: never[]) => void;

class FakeStream {
  handlers = new Map<string, Handler[]>();

  on = vi.fn((event: string, handler: Handler) => {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  });

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as (...values: unknown[]) => void)(...args);
    }
  }
}

class FakeChild {
  pid = 4242;
  kill = vi.fn();
  handlers = new Map<string, Handler[]>();
  stdout = new FakeStream();
  stderr = new FakeStream();

  once = vi.fn((event: string, handler: Handler) => {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  });

  // Intentionally keeps handlers so duplicate events can exercise the settled guard.
  off = vi.fn(() => this);

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as (...values: unknown[]) => void)(...args);
    }
  }
}

describe('SpawnUtil uncovered branches', () => {
  let child: FakeChild;
  let onSpy: ReturnType<typeof vi.spyOn>;
  let offSpy: ReturnType<typeof vi.spyOn>;
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let originalIsTty: boolean | undefined;
  let originalStderr: NodeJS.WriteStream;

  const start = async (input: Parameters<typeof SpawnUtil.spawnAndWait>[0]) => {
    const running = SpawnUtil.spawnAndWait(input);
    await vi.waitFor(() => {
      if (mocks.processHandlers['SIGINT'] === undefined) {
        throw new Error('signal handlers not registered');
      }
    }, { timeout: 2000 });
    return { running };
  };

  const fire = (signal: 'SIGINT' | 'SIGTERM') => {
    for (const handler of mocks.processHandlers[signal] ?? []) handler();
  };

  const setTty = (value: boolean | undefined) => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    child = new FakeChild();
    mocks.spawn.mockReturnValue(child);
    mocks.existsSync.mockReturnValue(false);
    mocks.processHandlers = {};
    originalIsTty = process.stdin.isTTY;
    originalStderr = process.stderr;

    onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: Handler) => {
      mocks.processHandlers[event] = [...(mocks.processHandlers[event] ?? []), handler];
      return process;
    }) as never);
    offSpy = vi.spyOn(process, 'off').mockImplementation((() => process) as never);
    writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(mocks.stderrWrite as never);
    (mocks.stderrWrite as ReturnType<typeof vi.fn>).mockReturnValue(true);
    vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    onSpy.mockRestore();
    offSpy.mockRestore();
    writeSpy.mockRestore();
    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalIsTty });
    Object.defineProperty(process, 'stderr', { configurable: true, value: originalStderr });
    delete process.env['CLI_SPAWN_TRACE'];
    delete process.env['ZIN_SPAWN_TRACE'];
  });

  it('traces with yes/on values and normalizes exit codes', async () => {
    process.env['CLI_SPAWN_TRACE'] = 'yes';
    const { running } = await start({ command: 'tool', args: [] });
    child.emit('close', null, 'SIGINT');
    await expect(running).resolves.toBe(0);

    process.env['CLI_SPAWN_TRACE'] = 'ON';
    delete mocks.processHandlers['SIGINT'];
    const { running: second } = await start({ command: 'tool', args: [] });
    child.emit('close', null, 'SIGHUP');
    await expect(second).resolves.toBe(1);

    const traces = mocks.stderrWrite.mock.calls.map((call) => String(call[0]));
    expect(traces.some((line) => line.includes('"label":"spawn.and-wait.start"'))).toBe(true);
    expect(traces.some((line) => line.includes('"childPid":4242'))).toBe(true);
  });

  it('ignores a missing stderr writer while tracing is enabled', async () => {
    process.env['CLI_SPAWN_TRACE'] = 'true';
    Object.defineProperty(process, 'stderr', {
      configurable: true,
      value: { ...originalStderr, write: undefined },
    });

    const { running } = await start({ command: 'tool', args: [] });
    child.emit('close', 0, null);
    await expect(running).resolves.toBe(0);
  });

  it('ignores duplicate close events after the child has settled', async () => {
    const { running } = await start({ command: 'tool', args: [] });

    child.emit('close', 5, null);
    child.emit('close', 9, null);

    await expect(running).resolves.toBe(5);
  });

  it('reports Error and non-Error child errors through the trace and wraps the rejection', async () => {
    process.env['CLI_SPAWN_TRACE'] = '1';
    const { running } = await start({ command: 'tool', args: [] });
    child.emit('error', new Error('boom'));
    await expect(running).rejects.toThrow(/Failed to spawn child process/);

    delete mocks.processHandlers['SIGINT'];
    const { running: second } = await start({ command: 'tool', args: [] });
    child.emit('error', 'plain child failure');
    await expect(second).rejects.toThrow(/Failed to spawn child process/);

    const traces = mocks.stderrWrite.mock.calls.map((call) => String(call[0]));
    expect(traces.some((line) => line.includes('"label":"spawn.child.error"'))).toBe(true);
  });

  it('forwards stdout/stderr chunks of both string and Buffer types', async () => {
    process.env['CLI_SPAWN_TRACE'] = 'true';
    const { running } = await start({ command: 'tool', args: [] });

    child.stdout.emit('data', 'plain output');
    child.stdout.emit('data', Buffer.from('binary output'));
    child.stdout.emit('end');
    child.stdout.emit('close');
    child.stderr.emit('data', 'plain error');
    child.stderr.emit('data', Buffer.from('binary error'));
    child.stderr.emit('end');
    child.stderr.emit('close');
    child.emit('close', 0, null);
    await running;

    const traces = mocks.stderrWrite.mock.calls.map((call) => String(call[0]));
    expect(traces.some((line) => line.includes('"bytes":13'))).toBe(true);
    expect(traces.some((line) => line.includes('"label":"spawn.child.stderr.end"'))).toBe(true);
  });

  it('immediately forwards signals to the child when forwardSignals is enabled', async () => {
    setTty(false);
    const { running } = await start({ command: 'tool', args: [] });

    fire('SIGINT');
    fire('SIGTERM');

    expect(child.kill).toHaveBeenCalledWith('SIGINT');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    child.emit('close', 0, null);
    await running;
  });

  it('reports non-Error signal forwarding failures and still removes handlers', async () => {
    setTty(false);
    const { running } = await start({ command: 'tool', args: [] });
    child.kill.mockImplementation(() => {
      throw 'plain kill failure';
    });

    expect(() => fire('SIGINT')).toThrow('Failed to forward signal to child process');
    expect(mocks.processHandlers['SIGINT']).toHaveLength(1);

    child.emit('close', 0, null);
    await running;
    expect(offSpy).toHaveBeenCalled();
  });

  it('delays and escalates signal forwarding for interactive TTY sessions', async () => {
    vi.useFakeTimers();
    setTty(true);
    const { running } = await start({
      command: 'tool',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 40,
    });

    fire('SIGINT');
    fire('SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();

    // A second signal while a delayed forwarder is pending is ignored.
    await vi.advanceTimersByTimeAsync(40);
    expect(child.kill).toHaveBeenCalledWith('SIGINT');
    expect(child.kill).not.toHaveBeenCalledWith('SIGTERM');

    fire('SIGTERM');
    await vi.advanceTimersByTimeAsync(40);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    await vi.advanceTimersByTimeAsync(400);
    expect(child.kill.mock.calls.length).toBeGreaterThanOrEqual(3);

    child.emit('close', 0, null);
    await running;
  });

  it('does not schedule delayed forwarding without a positive delay', async () => {
    setTty(true);
    const { running } = await start({ command: 'tool', args: [], forwardSignals: false });

    fire('SIGINT');
    expect(child.kill).not.toHaveBeenCalled();

    child.emit('close', 0, null);
    await running;
  });

  it('escalates a delayed SIGTERM with the same signal', async () => {
    vi.useFakeTimers();
    setTty(true);
    const { running } = await start({
      command: 'tool',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 25,
    });

    fire('SIGTERM');
    await vi.advanceTimersByTimeAsync(25);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    await vi.advanceTimersByTimeAsync(300);
    expect(child.kill.mock.calls.filter((call) => call[0] === 'SIGTERM').length).toBeGreaterThanOrEqual(2);

    child.emit('close', 0, null);
    await running;
  });

  it('skips escalation once the child is already closed', async () => {
    vi.useFakeTimers();
    setTty(true);
    const { running } = await start({
      command: 'tool',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 30,
    });

    fire('SIGINT');
    child.emit('close', 0, null);
    await vi.advanceTimersByTimeAsync(1000);
    await running;

    expect(child.kill).not.toHaveBeenCalled();
  });

  it('skips forwarding when the child closes before the delayed timer fires', async () => {
    vi.useFakeTimers();
    setTty(true);
    const { running } = await start({
      command: 'tool',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 60,
    });

    fire('SIGTERM');
    child.emit('close', 0, null);
    await running;
    await vi.advanceTimersByTimeAsync(100);

    expect(child.kill).not.toHaveBeenCalled();
  });

  it('skips escalation when the child closes after the delayed signal fires', async () => {
    vi.useFakeTimers();
    setTty(true);
    const { running } = await start({
      command: 'tool',
      args: [],
      forwardSignals: false,
      ttySignalForwardDelayMs: 20,
    });

    fire('SIGINT');
    await vi.advanceTimersByTimeAsync(20);
    expect(child.kill).toHaveBeenCalledWith('SIGINT');

    child.emit('close', 0, null);
    await running;
    await vi.advanceTimersByTimeAsync(300);

    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});
