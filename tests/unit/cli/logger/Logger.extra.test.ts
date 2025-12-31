import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

const joinConsoleCalls = (calls: unknown[][]): string => {
  const parts: string[] = [];

  for (const call of calls) {
    const callParts: string[] = [];

    for (const v of call) {
      callParts.push(String((v as unknown) ?? ''));
    }

    parts.push(callParts.join(' '));
  }

  return parts.join(' ');
};

describe('Logger extra branches', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env['LOG_FORMAT'];
    delete process.env.LOG_TO_FILE;

    const c = globalThis['console'];
    logSpy = vi.spyOn(c, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(c, 'error').mockImplementation(() => undefined);
  });

  it('handles various error types in Logger.error', async () => {
    const { Logger } = await vi.importActual<typeof import('@config/logger')>('@config/logger');

    Logger.error('err-str', 'simple');
    Logger.error('err-num', 123);
    Logger.error('err-bool', true);
    Logger.error('err-sym', Symbol('s'));
    Logger.error('err-fn', () => {});
    const circ: any = {};
    circ.self = circ;
    Logger.error('err-circ', circ);

    // Ensure console.error was invoked for errors
    expect((errorSpy as unknown as Mock).mock.calls.length).toBeGreaterThanOrEqual(6);

    const joined = joinConsoleCalls((errorSpy as unknown as Mock).mock.calls as unknown[][]);

    expect(joined).toContain('err-str');
    expect(joined).toContain('123');
    expect(joined).toContain('true');
    expect(joined).toContain('Symbol(');
    expect(joined).toContain('[Function]');
    expect(joined).toContain('[Circular]');
  });

  it('uses JSON log format when requested', async () => {
    process.env['LOG_FORMAT'] = 'json';
    const { Logger } = await vi.importActual<typeof import('@config/logger')>('@config/logger');

    Logger.info('hello-json', { a: 1 });

    // console.log should be called with a JSON string
    const calls = (logSpy as unknown as Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const first = String(calls[0][0]);
    const parsed = JSON.parse(first);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toContain('hello-json');
  });

  it('writes to file when LOG_TO_FILE=true', async () => {
    // Reset modules so our virtual mock is used by the logger's dynamic import
    vi.resetModules();
    process.env.LOG_TO_FILE = 'true';

    // Provide a virtual mock for the file writer
    vi.mock('@config/FileLogWriter', () => ({
      FileLogWriter: { write: vi.fn(), cleanOnce: vi.fn().mockReturnValue([]) },
    }));

    // Preload the mocked module so the logger's dynamic import resolves immediately
    const mod = await import('@config/FileLogWriter');
    const { Logger } = await vi.importActual<typeof import('@config/logger')>('@config/logger');

    Logger.info('to-file', { b: 2 });

    // Allow async file writer promise resolution (flush microtasks)
    await new Promise((r) => setTimeout(r, 20));

    expect((mod.FileLogWriter.write as unknown as Mock).mock.calls.length).toBeGreaterThanOrEqual(
      1
    );
  });
});
