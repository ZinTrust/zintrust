import { beforeEach, describe, expect, it, vi } from 'vitest';

const infoMock = vi.fn();
const warnMock = vi.fn();
const debugMock = vi.fn();
const errorMock = vi.fn();

const redisState = {
  quit: vi.fn(async () => 'OK'),
  disconnect: vi.fn(),
};

vi.mock('@zintrust/core', () => ({
  ErrorFactory: {
    createConfigError: (message: string) => new Error(message),
  },
  Logger: {
    info: infoMock,
    warn: warnMock,
    debug: debugMock,
    error: errorMock,
  },
  createRedisConnection: vi.fn(() => ({
    quit: redisState.quit,
    disconnect: redisState.disconnect,
    zadd: vi.fn(),
    expire: vi.fn(),
    zrange: vi.fn(),
    zrevrange: vi.fn(),
    zrem: vi.fn(),
  })),
}));

vi.mock('../../src/config/workerConfig', () => ({
  keyPrefixFor: vi.fn((...parts: string[]) => parts.join(':')),
}));

describe('DeadLetterQueue.shutdown', () => {
  beforeEach(() => {
    vi.resetModules();
    infoMock.mockClear();
    warnMock.mockClear();
    debugMock.mockClear();
    errorMock.mockClear();
    redisState.quit.mockReset().mockResolvedValue('OK');
    redisState.disconnect.mockReset();
  });

  it('forces disconnect when Redis quit hangs during shutdown', async () => {
    redisState.quit.mockImplementationOnce(() => new Promise<string>(() => undefined));

    const { DeadLetterQueue } = await import('../../src/DeadLetterQueue');

    DeadLetterQueue.initialize({ host: '127.0.0.1', port: 6379 } as never, {
      enabled: true,
      defaultRetentionDays: 7,
      gdprCompliant: true,
      hipaaCompliant: false,
      soc2Compliant: true,
      anonymizeInsteadOfDelete: false,
    });

    await expect(DeadLetterQueue.shutdown()).resolves.toBeUndefined();

    expect(warnMock).toHaveBeenCalledWith(
      'DeadLetterQueue graceful Redis shutdown failed, forcing disconnect',
      expect.any(Error)
    );
    expect(redisState.disconnect).toHaveBeenCalledTimes(1);
    expect(infoMock).toHaveBeenCalledWith('DeadLetterQueue shutdown complete');
  });
});
