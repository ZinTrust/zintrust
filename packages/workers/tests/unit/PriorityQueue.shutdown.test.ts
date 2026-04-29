import { beforeEach, describe, expect, it, vi } from 'vitest';

const infoMock = vi.fn();
const warnMock = vi.fn();
const debugMock = vi.fn();
const errorMock = vi.fn();

vi.mock('@zintrust/core', () => ({
  ErrorFactory: {
    createWorkerError: (message: string) => new Error(message),
  },
  Logger: {
    info: infoMock,
    warn: warnMock,
    debug: debugMock,
    error: errorMock,
  },
}));

describe('PriorityQueue.shutdown', () => {
  beforeEach(() => {
    vi.resetModules();
    infoMock.mockClear();
    warnMock.mockClear();
    debugMock.mockClear();
    errorMock.mockClear();
  });

  it('does not dynamically load queue-redis during shutdown when no queues were used', async () => {
    const { PriorityQueue } = await import('../../src/PriorityQueue');

    await expect(PriorityQueue.shutdown()).resolves.toBeUndefined();

    expect(infoMock).toHaveBeenCalledWith('PriorityQueue shutting down via BullMQRedisQueue...');
    expect(infoMock).toHaveBeenCalledWith('PriorityQueue shutdown complete');
    expect(warnMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });
});
