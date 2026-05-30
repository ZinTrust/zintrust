import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shutdownMock = vi.fn(async () => undefined);
const infoMock = vi.fn();
const warnMock = vi.fn();
const debugMock = vi.fn();
const errorMock = vi.fn();

vi.mock('../../src/WorkerFactory', () => ({
  WorkerFactory: {
    shutdown: shutdownMock,
  },
}));

vi.mock('@zintrust/core/logger', () => ({
  Logger: {
    info: infoMock,
    warn: warnMock,
    debug: debugMock,
    error: errorMock,
  },
}));

describe('WorkerShutdown', () => {
  beforeEach(() => {
    shutdownMock.mockClear();
    infoMock.mockClear();
    warnMock.mockClear();
    debugMock.mockClear();
    errorMock.mockClear();
  });

  afterEach(async () => {
    const { WorkerShutdown } = await import('../../src/WorkerShutdown');
    WorkerShutdown.unregisterShutdownHandlers();
    vi.restoreAllMocks();
  });

  it('falls back when Logger.info is unavailable during shutdown completion', async () => {
    const { Logger } = await import('@zintrust/core/logger');
    const { WorkerShutdown } = await import('../../src/WorkerShutdown');

    infoMock
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new TypeError('Logger.info is not a function');
      });
    shutdownMock.mockImplementationOnce(async () => {
      (Logger as { info?: unknown }).info = undefined;
    });

    await expect(
      WorkerShutdown.shutdown({ signal: 'APP_SHUTDOWN', timeout: 5000, forceExit: false })
    ).resolves.toBeUndefined();

    expect(shutdownMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(
      '✅ Worker management system shutdown complete',
      expect.objectContaining({ signal: 'APP_SHUTDOWN' })
    );
    expect(errorMock).not.toHaveBeenCalledWith(
      '❌ Error during worker management system shutdown',
      expect.anything()
    );
  });
});
