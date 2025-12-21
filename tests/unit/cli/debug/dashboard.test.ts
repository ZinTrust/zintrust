import { beforeEach, describe, expect, it, vi } from 'vitest';

const cursorTo = vi.fn();
const rlClose = vi.fn();
const createInterface = vi.fn(() => ({ close: rlClose }));

vi.mock('node:readline', async () => {
  const actual = await vi.importActual<typeof import('node:readline')>('node:readline');
  return {
    ...actual,
    createInterface,
    cursorTo,
  };
});

const totalmem = vi.fn(() => 10 * 1024 * 1024);
const freemem = vi.fn(() => 5 * 1024 * 1024);
const loadavg = vi.fn(() => [0.5, 0.25, 0.1]);

vi.mock('node:os', () => ({
  totalmem,
  freemem,
  loadavg,
}));

const randomInt = vi.fn();
vi.mock('node:crypto', () => ({
  randomInt,
}));

const passthrough = String;

vi.mock('chalk', () => ({
  default: {
    bgBlue: { white: { bold: passthrough } },
    gray: passthrough,
    cyan: { bold: passthrough },
    green: passthrough,
    red: { bold: passthrough },
  },
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('start(): clears screen, hides cursor, renders, then updates on interval', async () => {
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as unknown as typeof process.stdout.write);
    const uptimeSpy = vi.spyOn(process, 'uptime').mockReturnValue(3661.2);

    // updateStats call #1: make both request + query branches true, including nested n1Warnings
    // randomInt calls in order: gate1, incTotal, active, avg, gate2, queryInc, n1Gate
    randomInt
      .mockReturnValueOnce(701)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(801)
      .mockReturnValueOnce(4)
      .mockReturnValueOnce(901)
      // updateStats call #2: both gates false
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      // updateStats call #3: request gate false, query gate true, nested false
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(0);

    const { Dashboard } = await import('@cli/debug/Dashboard' + '?v=start');

    vi.useFakeTimers();

    const dash = new Dashboard();

    const updateStatsSpy = vi.spyOn(dash as unknown as { updateStats: () => void }, 'updateStats');
    const renderSpy = vi.spyOn(dash as unknown as { render: () => void }, 'render');

    dash.start();

    // Initial render
    expect(writeSpy).toHaveBeenCalledWith('\x1Bc');
    expect(writeSpy).toHaveBeenCalledWith('\x1B[?25l');
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Run 3 ticks to cover true/false branches in updateStats
    await vi.advanceTimersByTimeAsync(3000);

    expect(updateStatsSpy).toHaveBeenCalledTimes(3);
    expect(renderSpy).toHaveBeenCalledTimes(1 + 3);

    dash.stop();

    expect(writeSpy).toHaveBeenCalledWith('\x1B[?25h');
    expect(rlClose).toHaveBeenCalledTimes(1);

    // render() should move cursor and write header/footer
    expect(cursorTo).toHaveBeenCalledWith(process.stdout, 0, 0);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('ZINTRUST DEBUG DASHBOARD'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Press Ctrl+C to exit'));

    vi.useRealTimers();
    uptimeSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('update(): shallow merges stats object', async () => {
    const { Dashboard } = await import('@cli/debug/Dashboard' + '?v=update');

    const dash = new Dashboard();

    dash.update({
      requests: {
        total: 10,
        active: 2,
        avgDuration: 33,
      },
    });

    // Force a render to verify the new stats are used
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as unknown as typeof process.stdout.write);

    (dash as unknown as { render: () => void }).render();

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Total Requests: 10'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Active Requests: 2'));

    writeSpy.mockRestore();
  });

  it('stop(): does not clear interval when timer is unset', async () => {
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as unknown as typeof process.stdout.write);

    const { Dashboard } = await import('@cli/debug/Dashboard' + '?v=stop');

    const dash = new Dashboard();

    // no start() called, timer is undefined
    dash.stop();

    expect(writeSpy).toHaveBeenCalledWith('\x1B[?25h');
    expect(rlClose).toHaveBeenCalledTimes(1);

    writeSpy.mockRestore();
  });
});
