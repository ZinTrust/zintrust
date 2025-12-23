import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerError = vi.fn();

vi.mock('@config/logger', () => ({
  Logger: {
    error: loggerError,
  },
}));

vi.mock('@config/env', () => ({
  Env: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
  },
}));

type DataCallback = (data: Buffer) => void;

type ErrorCallback = (error: Error) => void;

class FakeSocket {
  public destroyed = false;
  public writes: string[] = [];

  private dataOnce: DataCallback | undefined;
  private errorOn: ErrorCallback | undefined;

  public constructor(private readonly responses: Record<string, string>) {}

  public once(event: string, cb: (data: Buffer) => void): void {
    if (event === 'data') this.dataOnce = cb;
  }

  public on(event: string, cb: (error: Error) => void): void {
    if (event === 'error') this.errorOn = cb;
  }

  public write(command: string): void {
    this.writes.push(command);
    const response = this.responses[command] ?? '+OK\r\n';
    const cb = this.dataOnce;
    this.dataOnce = undefined;
    if (cb) cb(Buffer.from(response));
  }

  public triggerError(error: Error): void {
    if (this.errorOn) this.errorOn(error);
  }
}

const connectMock = vi.fn();

vi.mock('node:net', () => ({
  connect: connectMock,
}));

describe('RedisDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectMock.mockReset();
  });

  it('handles basic commands (get/set/setex/delete/clear/has) and reuses connection', async () => {
    const responses: Record<string, string> = {
      'GET myKey\r\n': '$4\r\n"hi"\r\n',
      'EXISTS myKey\r\n': ':1\r\n',
      'SET myKey "hi"\r\n': '+OK\r\n',
      'SETEX myKey 5 "hi"\r\n': '+OK\r\n',
      'DEL myKey\r\n': ':1\r\n',
      'FLUSHDB\r\n': '+OK\r\n',
    };

    const socket = new FakeSocket(responses);

    connectMock.mockImplementation((port: number, host: string, cb: () => void) => {
      expect(port).toBe(6379);
      expect(host).toBe('localhost');
      queueMicrotask(cb);
      return socket;
    });

    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.get<string>('myKey')).resolves.toBe('hi');
    await driver.set('myKey', 'hi');
    await driver.set('myKey', 'hi', 5);
    await driver.delete('myKey');
    await driver.clear();
    await expect(driver.has('myKey')).resolves.toBe(true);

    // connect() should only run once due to cached socket
    expect(connectMock).toHaveBeenCalledTimes(1);

    expect(socket.writes).toEqual([
      'GET myKey\r\n',
      'SET myKey "hi"\r\n',
      'SETEX myKey 5 "hi"\r\n',
      'DEL myKey\r\n',
      'FLUSHDB\r\n',
      'EXISTS myKey\r\n',
    ]);
  });

  it('returns null when Redis reports missing key', async () => {
    const socket = new FakeSocket({
      'GET missing\r\n': '$-1\r\n',
    });

    connectMock.mockImplementation((_port: number, _host: string, cb: () => void) => {
      queueMicrotask(cb);
      return socket;
    });

    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.get('missing')).resolves.toBeNull();
  });

  it('reconnects when the cached socket is destroyed', async () => {
    const socket1 = new FakeSocket({
      'EXISTS a\r\n': ':0\r\n',
    });
    const socket2 = new FakeSocket({
      'EXISTS a\r\n': ':0\r\n',
    });

    let call = 0;
    connectMock.mockImplementation((_port: number, _host: string, cb: () => void) => {
      call += 1;
      queueMicrotask(cb);
      return call === 1 ? socket1 : socket2;
    });

    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.has('a')).resolves.toBe(false);

    socket1.destroyed = true;
    await expect(driver.has('a')).resolves.toBe(false);

    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('returns null and logs on connection/send failures', async () => {
    const socket = new FakeSocket({});

    connectMock.mockImplementation((_port: number, _host: string) => {
      // Let RedisDriver register its error handler before firing.
      queueMicrotask(() => socket.triggerError(new Error('boom')));
      return socket;
    });

    const { RedisDriver } = await import('@cache/drivers/RedisDriver');
    const driver = RedisDriver.create();

    await expect(driver.get('k')).resolves.toBeNull();

    expect(loggerError).toHaveBeenCalledWith('Redis Connection Error: boom');
    expect(loggerError).toHaveBeenCalledWith('Redis GET failed', expect.any(Error));
  });
});
