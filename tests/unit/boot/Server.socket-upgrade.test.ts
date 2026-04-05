import type { IApplication } from '@boot/Application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createServerMock = vi.hoisted(() => vi.fn());
const getRuntimeMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

vi.mock('@node-singletons/http', () => ({ createServer: createServerMock }));
vi.mock('@config/logger', () => ({
  Logger: {
    warn: warnMock,
  },
}));
vi.mock('@sockets/SocketRuntimeRegistry', () => ({
  SocketRuntimeRegistry: {
    getRuntime: getRuntimeMock,
  },
}));

const createApp = (): IApplication => {
  return {
    getRouter: vi.fn(() => ({ match: vi.fn() })),
    getContainer: vi.fn(() => ({})),
  } as unknown as IApplication;
};

const createSocket = () => {
  return {
    write: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  };
};

const captureUpgradeHandler = async () => {
  let upgradeHandler: ((request: any, socket: any, head: Buffer) => void) | undefined;
  createServerMock.mockReturnValue({
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'upgrade') {
        upgradeHandler = handler as (request: any, socket: any, head: Buffer) => void;
      }
    }),
    listen: vi.fn(),
    close: vi.fn(),
  });

  const { Server } = await import('../../../src/boot/Server');
  Server.create(createApp());

  return upgradeHandler;
};

describe('Server socket upgrades', () => {
  beforeEach(() => {
    createServerMock.mockReset();
    getRuntimeMock.mockReset();
    warnMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('delegates websocket upgrades to the registered socket runtime', async () => {
    const upgradeHandler = await captureUpgradeHandler();

    const runtime = {
      isEnabled: vi.fn(() => true),
      canHandleNodeUpgrade: vi.fn(() => true),
      handleNodeUpgrade: vi.fn(async () => true),
    };
    getRuntimeMock.mockReturnValue(runtime);
    const socket = createSocket();

    upgradeHandler?.(
      {
        url: '/app/demo-key',
        headers: { upgrade: 'websocket' },
      },
      socket,
      Buffer.alloc(0)
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.canHandleNodeUpgrade).toHaveBeenCalled();
    expect(runtime.handleNodeUpgrade).toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
  });

  it('rejects non-websocket upgrade requests with 400', async () => {
    const upgradeHandler = await captureUpgradeHandler();
    const socket = createSocket();

    upgradeHandler?.(
      {
        url: '/app/demo-key',
        headers: { upgrade: 'h2c' },
      },
      socket,
      Buffer.alloc(0)
    );

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('400 Bad Request'));
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects upgrades when no socket runtime is registered', async () => {
    const upgradeHandler = await captureUpgradeHandler();
    getRuntimeMock.mockReturnValue(undefined);
    const socket = createSocket();

    upgradeHandler?.(
      {
        url: '/app/demo-key',
        headers: { upgrade: 'websocket' },
      },
      socket,
      Buffer.alloc(0)
    );

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('404 Not Found'));
  });

  it('rejects upgrades that the runtime declines to handle', async () => {
    const upgradeHandler = await captureUpgradeHandler();
    getRuntimeMock.mockReturnValue({
      isEnabled: vi.fn(() => true),
      canHandleNodeUpgrade: vi.fn(() => false),
      handleNodeUpgrade: vi.fn(),
    });
    const socket = createSocket();

    upgradeHandler?.(
      {
        url: '/app/demo-key',
        headers: { upgrade: 'websocket' },
      },
      socket,
      Buffer.alloc(0)
    );

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('404 Not Found'));
  });

  it('returns 426 when the runtime reports an unhandled upgrade', async () => {
    const upgradeHandler = await captureUpgradeHandler();
    getRuntimeMock.mockReturnValue({
      isEnabled: vi.fn(() => true),
      canHandleNodeUpgrade: vi.fn(() => true),
      handleNodeUpgrade: vi.fn(async () => false),
    });
    const socket = createSocket();

    upgradeHandler?.(
      {
        url: '/app/demo-key',
        headers: { upgrade: 'websocket' },
      },
      socket,
      Buffer.alloc(0)
    );

    await Promise.resolve();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('426 Upgrade Required'));
  });

  it('returns 500 and logs a warning when upgrade handling throws', async () => {
    const upgradeHandler = await captureUpgradeHandler();
    const failure = new Error('boom');
    getRuntimeMock.mockReturnValue({
      isEnabled: vi.fn(() => true),
      canHandleNodeUpgrade: vi.fn(() => true),
      handleNodeUpgrade: vi.fn(async () => {
        throw failure;
      }),
    });
    const socket = createSocket();

    upgradeHandler?.(
      {
        url: '/app/demo-key',
        headers: { upgrade: 'websocket' },
      },
      socket,
      Buffer.alloc(0)
    );

    await Promise.resolve();
    expect(warnMock).toHaveBeenCalledWith('Socket upgrade failed', failure);
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('500 Internal Server Error'));
  });
});
