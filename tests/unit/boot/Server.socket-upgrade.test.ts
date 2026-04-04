import type { IApplication } from '@boot/Application';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createServerMock = vi.hoisted(() => vi.fn());
const getRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('@node-singletons/http', () => ({ createServer: createServerMock }));
vi.mock('@sockets/SocketRuntimeRegistry', () => ({
  SocketRuntimeRegistry: {
    getRuntime: getRuntimeMock,
  },
}));

describe('Server socket upgrades', () => {
  beforeEach(() => {
    createServerMock.mockReset();
    getRuntimeMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('delegates websocket upgrades to the registered socket runtime', async () => {
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

    const runtime = {
      isEnabled: vi.fn(() => true),
      canHandleNodeUpgrade: vi.fn(() => true),
      handleNodeUpgrade: vi.fn(async () => true),
    };
    getRuntimeMock.mockReturnValue(runtime);

    const { Server } = await import('../../../src/boot/Server');
    const app = {
      getRouter: vi.fn(() => ({ match: vi.fn() })),
      getContainer: vi.fn(() => ({})),
    } as unknown as IApplication;

    Server.create(app);

    const socket = {
      write: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
    };

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
});
